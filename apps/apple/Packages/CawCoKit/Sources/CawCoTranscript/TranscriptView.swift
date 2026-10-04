import CawCoAPI
import CawCoCore
import CawCoDesign
import OSLog
public import UIKit

/// Scene-local reading position, keyed by the stable item id rather than by
/// a scroll offset that changes as the conversation grows.
public struct TranscriptPosition: Codable, Sendable {
    public let following: Bool
    public let anchor: String?
    public let offset: Double
}

/// The native transcript (Transcript.svelte): the hub's blocks folded into
/// the web's rows, each drawn by the native twin of its web component, in a
/// self-sizing list keyed by stable ids. Settled items are configured once;
/// the live tail is paced on the display link and only its cells update.
public final class TranscriptView: UIView, UICollectionViewDelegate {
    /// The hub the session is on: the fleet for delegates and runs, the
    /// pictures and memory history it serves, the asks parked on the reader.
    public weak var hub: HubConnection? { didSet { env.hub = hub; dirty = true } }
    /// Opening another session or a run in its own view; the host routes it.
    public var onOpenSession: (String) -> Void = { _ in }
    public var onOpenRun: (String) -> Void = { _ in }
    /// "Back to the fleet", from the state an unreachable id shows.
    public var onReturnToFleet: () -> Void = {}
    private let paneState = PaneState()

    private let collection: UICollectionView
    private var dataSource: UICollectionViewDiffableDataSource<Int, String>!
    private let env = RowEnv()
    private var items: [String: Item] = [:]
    private var prints: [String: String] = [:]
    private var order: [String] = []
    private var open = Set<String>()
    private var transcript: SessionTranscript?

    // The hub's blocks, read once per revision.
    private var revision = -1
    private var blocks: [Block] = []
    private var branches: [String: Branch] = [:]
    private var queued: [Block] = []
    private var rows: [Row] = []
    private var voices = Voices()

    // The live tail, paced (prompt-3: candidate 3, paced).
    private var splitter = MarkdownSplitter()
    private var liveSources: [Builder.Source] = []
    private var received = ""
    private var characters: [Character] = []
    private var cursor = 0
    private var shown = 0.0
    private var rate = 0.0
    private var lastTick = 0.0
    private var lastArrival = 0.0
    private var arrivals: [(end: Int, time: Double)] = []
    private var drainDeadline: Double?
    private var generation = 0
    private var liveWasOn = false
    private var lastAnswer = ""
    private var reasoningEnded = false
    private var keys: [String: String] = [:]
    private var ahead: Set<String>?
    private var folding: String?

    private var dirty = true
    private var following = true
    private var landed = false
    private var known = Set<String>()
    private var arriving: [String: Double] = [:]
    private var gliding = false
    private var farFromLatest = false
    private var pendingPosition: TranscriptPosition?
    private var link: CADisplayLink?
    private var proxy: DisplayTarget?
    private var watchedDelegates = Set<String>()
    /// The session this view answers the delegate tray for (DelegateTrayState `reportRow`).
    private var trayKey: String?
    /// The tray's news this view has already said.
    private var spoken: DelegateTrayState.News?
    /// The report the tray asked for, until the scroll to it has settled.
    private var revealing: String?
    private let latestButton = DockPill(glyph: .arrowDown, title: "Jump to latest")
    private let catchUp = DockPill(glyph: nil, title: "Catching up…")
    private let compacting = DockPill(glyph: nil, title: "Compacting context…", pill: true)
    private let signposter = OSSignposter(subsystem: "dev.cawco.app", category: "Transcript")

    public override init(frame: CGRect) {
        let layout = UICollectionViewCompositionalLayout { _, environment in
            let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
            let section = NSCollectionLayoutSection(group: .vertical(layoutSize: size, subitems: [NSCollectionLayoutItem(layoutSize: size)]))
            // The ledger's asymmetric inset: 25 at the start, 21 at the end; 18 both 900pt wide and under.
            let narrow = environment.container.contentSize.width <= 900
            section.contentInsets = .init(top: 0, leading: narrow ? Space.space5 : Space.space7, bottom: Space.space5,
                                          trailing: narrow ? Space.space5 : Space.space6)
            return section
        }
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        super.init(frame: frame)
        // The session pane's ground (SessionPane.svelte `.pane`): the recess, not the page.
        backgroundColor = Palette.surfaceRecess
        collection.backgroundColor = Palette.surfaceRecess
        collection.delegate = self
        collection.keyboardDismissMode = .interactive
        collection.selfSizingInvalidation = .enabledIncludingConstraints
        collection.accessibilityLabel = "Session transcript"
        collection.translatesAutoresizingMaskIntoConstraints = false
        addSubview(collection)
        NSLayoutConstraint.activate([
            collection.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor),
            collection.topAnchor.constraint(equalTo: topAnchor),
            collection.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        makeDataSource()
        wireEnv()
        placeDock()
        paneState.isHidden = true
        pin(paneState)
        paneState.onRetry = { [weak self] in
            guard let self, let id = transcript?.id else { return }
            hub?.sessions.read(id)
        }
        paneState.onReturn = { [weak self] in self?.onReturnToFleet() }
        registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitPreferredContentSizeCategory.self]) { (view: TranscriptView, _: UITraitCollection) in
            view.env.cache.clear()
            view.prints = [:]
            view.dirty = true
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("TranscriptView is built in code") }

    private func makeDataSource() {
        func registration<V: RowContent>(_: V.Type) -> UICollectionView.CellRegistration<HostCell<V>, String> {
            UICollectionView.CellRegistration<HostCell<V>, String> { [weak self] cell, _, id in
                guard let self, let item = items[id] else { return }
                cell.install(env: env)
                cell.configure(item)
            }
        }
        let piece = registration(PieceView.self), user = registration(UserTurnView.self), tool = registration(ToolLineView.self)
        let thinking = registration(ThinkingView.self), system = registration(SystemLineView.self), peer = registration(PeerView.self)
        let question = registration(QuestionCardView.self), subagent = registration(SubagentView.self)
        let delegate = registration(DelegateView.self), run = registration(RunView.self), live = registration(LiveToolView.self)
        let notice = registration(NoticeView.self), compaction = registration(CompactionDividerView.self)
        dataSource = UICollectionViewDiffableDataSource(collectionView: collection) { [weak self] view, index, id in
            guard let kind = self?.items[id]?.kind else { return view.dequeueConfiguredReusableCell(using: notice, for: index, item: id) }
            switch kind {
            case .piece: return view.dequeueConfiguredReusableCell(using: piece, for: index, item: id)
            case .user: return view.dequeueConfiguredReusableCell(using: user, for: index, item: id)
            case .tool: return view.dequeueConfiguredReusableCell(using: tool, for: index, item: id)
            case .thinking: return view.dequeueConfiguredReusableCell(using: thinking, for: index, item: id)
            case .system, .harness: return view.dequeueConfiguredReusableCell(using: system, for: index, item: id)
            case .peer: return view.dequeueConfiguredReusableCell(using: peer, for: index, item: id)
            case .question: return view.dequeueConfiguredReusableCell(using: question, for: index, item: id)
            case .subagent: return view.dequeueConfiguredReusableCell(using: subagent, for: index, item: id)
            case .delegate: return view.dequeueConfiguredReusableCell(using: delegate, for: index, item: id)
            case .run: return view.dequeueConfiguredReusableCell(using: run, for: index, item: id)
            case .compaction: return view.dequeueConfiguredReusableCell(using: compaction, for: index, item: id)
            case .livetool: return view.dequeueConfiguredReusableCell(using: live, for: index, item: id)
            case .notice, .empty: return view.dequeueConfiguredReusableCell(using: notice, for: index, item: id)
            }
        }
    }

    private func wireEnv() {
        env.isOpen = { [weak self] key in self?.open.contains(key) ?? false }
        env.toggle = { [weak self] key, view in self?.toggle(key, from: view) }
        env.openLightbox = { [weak self] item, _ in
            guard let self, let host = window?.rootViewController else { return }
            var top = host
            while let shown = top.presentedViewController { top = shown }
            top.present(Lightbox(item, env: env), animated: !UIAccessibility.isReduceMotionEnabled)
        }
        env.parentBlocks = { [weak self] in self?.blocks ?? [] }
        env.delegateTranscript = { [weak self] id in self?.hub?.sessions.transcripts[id] }
        env.watchDelegate = { [weak self] id, watch in
            guard let self, let sessions = hub?.sessions else { return }
            if watch, !watchedDelegates.contains(id) { watchedDelegates.insert(id); _ = sessions.open(id) }
            if !watch, watchedDelegates.contains(id) { watchedDelegates.remove(id); sessions.close(id) }
        }
        env.runSteps = { [weak self] id in self.map { $0.steps(id) } ?? [] }
        env.openSession = { [weak self] id in self?.onOpenSession(id) }
        env.openRun = { [weak self] id in self?.onOpenRun(id) }
    }

    deinit {
        MainActor.assumeIsolated {
            for id in watchedDelegates { hub?.sessions.close(id) }
            leaveTray()
        }
    }

    /// A run's steps off its detail (WorkflowRunsStore), schedule order.
    private func steps(_ runId: String) -> [RunStep] {
        guard let detail = hub?.workflowRuns.open(runId), let run = detail.run,
              let data = try? JSONEncoder().encode(run),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        let nodes = ((raw["graph"] as? [String: Any])?["nodes"] as? [[String: Any]]) ?? []
        let parse = ISO8601DateFormatter()
        parse.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func date(_ value: Any?) -> Date? {
            if let seconds = value as? Double { return Date(timeIntervalSinceReferenceDate: seconds) }
            return (value as? String).flatMap { parse.date(from: $0) ?? ISO8601DateFormatter().date(from: $0) }
        }
        return (raw["steps"] as? [[String: Any]] ?? []).map { step in
            let node = step["nodeId"] as? String ?? ""
            var title = nodes.first { $0["id"] as? String == node }?["title"] as? String
                ?? step["title"] as? String ?? node
            if let index = step["mapIndex"] as? Int { title += " [\(index)]" }
            return RunStep(id: step["id"] as? String ?? node, status: step["status"] as? String ?? "", title: title,
                           started: date(step["startedAt"]), ended: date(step["endedAt"]))
        }
    }

    override public func didMoveToWindow() {
        super.didMoveToWindow()
        link?.invalidate(); link = nil
        if window != nil {
            let target = DisplayTarget(self)
            proxy = target
            let link = CADisplayLink(target: target, selector: #selector(DisplayTarget.tick(_:)))
            link.add(to: .main, forMode: .common)
            self.link = link
            lastTick = 0
        } else {
            // Off the screen, every delegate card this view drew has left it.
            for cell in collection.visibleCells { (cell as? HostCell<DelegateView>)?.row.untrack() }
        }
        joinTray()
    }

    // MARK: The delegate tray

    /// Answers the tray for this view's session while it is on screen: the row
    /// a report is drawn in, for the chip that flies home to it.
    private func joinTray() {
        let id = env.sessionId
        guard window != nil, !id.isEmpty else { leaveTray(); return }
        guard trayKey != id else { return }
        leaveTray()
        trayKey = id
        DelegateTrayState.shared.reportRow[id] = { [weak self] block in self?.reportRow(block) }
    }

    private func leaveTray() {
        if let trayKey { DelegateTrayState.shared.reportRow[trayKey] = nil }
        trayKey = nil
    }

    /// The row `block` is drawn in right now, when its top is inside the
    /// list's view (DelegateTray.svelte `reportInView`); the tray checks its
    /// foot against the composer itself.
    private func reportRow(_ block: String) -> UIView? {
        guard let index = dataSource.indexPath(for: block),
              let cell = collection.cellForItem(at: index) as? HostCell<PeerView>, let row = cell.row else { return nil }
        let box = row.convert(row.bounds, to: collection)
        let inView = box.height > 0 && box.minY >= visibleBox.minY
        Self.tray.info("report row \(block, privacy: .public) \(inView ? "in view" : "above the view", privacy: .public), row \(box.debugDescription, privacy: .public), view \(self.visibleBox.debugDescription, privacy: .public)")
        return inView ? row : nil
    }

    private static let tray = Logger(subsystem: "dev.cawco.app", category: "Tray")

    /// The list's view: its bounds less what the bars and the composer cover.
    private var visibleBox: CGRect { collection.bounds.inset(by: collection.adjustedContentInset) }

    /// What the tray asked of this session since the last frame: a report to
    /// bring into view (Transcript.svelte `trayReveal`), and its news to say
    /// (`trayNews`).
    private func honourTray() {
        let tray = DelegateTrayState.shared
        let id = env.sessionId
        if let want = tray.reveal[id] {
            tray.reveal[id] = nil
            if let target = centred(want), abs(target - collection.contentOffset.y) > 0.5 {
                pendingPosition = nil
                Self.tray.info("reveal \(want, privacy: .public): offset \(Double(self.collection.contentOffset.y), format: .fixed(precision: 1)) to \(Double(target), format: .fixed(precision: 1))")
                if UIAccessibility.isReduceMotionEnabled {
                    collection.contentOffset.y = target
                    place(collection)
                    settled(want)
                } else {
                    // The tail is not followed while the list glides to the row.
                    revealing = want
                    gliding = true
                    collection.setContentOffset(CGPoint(x: 0, y: target), animated: true)
                }
            }
        }
        if landed, let news = tray.news[id], news != spoken {
            spoken = news
            if !news.assertive.isEmpty {
                UIAccessibility.post(notification: .announcement, argument: NSAttributedString(
                    string: news.assertive, attributes: [.accessibilitySpeechAnnouncementPriority: UIAccessibilityPriority.high]
                ))
            } else if !news.polite.isEmpty {
                UIAccessibility.post(notification: .announcement, argument: news.polite)
            }
        }
    }

    /// The offset that stands `id`'s row in the middle of the list's view, as
    /// near as the list's ends allow (`scrollToIndex`, `align: "center"`).
    private func centred(_ id: String) -> CGFloat? {
        guard let index = dataSource.indexPath(for: id), let frame = collection.layoutAttributesForItem(at: index)?.frame else { return nil }
        let inset = collection.adjustedContentInset
        let view = collection.bounds.height - inset.top - inset.bottom
        return min(bottomOffset, max(-inset.top, frame.midY - view / 2 - inset.top))
    }

    /// The glide to a revealed report has settled. Rows it passed were sized
    /// on the way, so the row is centred once more where it now stands.
    public func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        guard let want = revealing else { return }
        revealing = nil
        gliding = false
        if let target = centred(want) { collection.contentOffset.y = target }
        place(scrollView)
        settled(want)
    }

    /// Where a revealed row came to rest, for the log.
    private func settled(_ id: String) {
        guard let index = dataSource.indexPath(for: id), let frame = collection.layoutAttributesForItem(at: index)?.frame else { return }
        Self.tray.info("revealed \(id, privacy: .public): row \(frame.debugDescription, privacy: .public), view \(self.visibleBox.debugDescription, privacy: .public)")
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        let columns = Columns.at(width: bounds.width)
        if columns != env.columns {
            env.columns = columns
            prints = [:]
            dirty = true
        }
    }

    // MARK: Reading the transcript

    public func configure(_ transcript: SessionTranscript) {
        self.transcript = transcript
        env.sessionId = transcript.id
        joinTray()
        env.machineId = transcript.location?.machineId
        if let harness = transcript.facts?.harness ?? transcript.location?.harness {
            env.agentName = ["claude": "Claude Code", "opencode": "opencode", "code": "opencode", "pi": "pi"][harness] ?? harness
        }
        if transcript.blockRevision != revision {
            revision = transcript.blockRevision
            blocks = transcript.blocks.compactMap(Block.init)
            var map: [String: Branch] = [:]
            let streams = (try? JSONEncoder().encode(transcript.tail?.streams))
                .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            for page in transcript.branches {
                let inner = page.value2.blocks.compactMap(Block.init)
                let streaming = streams[page.value1.toolUseId] as? String ?? ""
                if let branch = Branch(page, blocks: inner, streaming: streaming) { map[branch.toolUseId] = branch }
            }
            branches = map
            queued = transcript.queued.compactMap(Block.init)
            dirty = true
        }
        let tail = transcript.tail
        let next = tail?.streaming ?? ""
        if next != received {
            let now = CACurrentMediaTime()
            if !next.hasPrefix(received) || next.isEmpty {
                splitter = MarkdownSplitter(); liveSources = []; cursor = 0; shown = 0; rate = 0
                arrivals = []
            }
            received = next
            characters = Array(next)
            arrivals.append((characters.count, now))
            lastArrival = now
            drainDeadline = nil
        }
        dirty = true
    }

    /// The rows the reader sees: settled first (rows.ts `drawnOf` — an
    /// unanswered question is the composer's while asks reach the reader).
    private func settledRows() -> [Row] {
        let bypass = factsValue("permissionMode") as? String == "bypassPermissions"
        let drawn = blocks.filter { block in
            !(Fold.isQuestion(block) && block.toolStatus == "pending" && !bypass)
                && block.type != "send.ref" && block.type != "system.init"
        }
        var voices = Voices()
        let rows = Fold.rows(drawn, branches: branches, voices: &voices)
        self.voices = voices
        return rows
    }

    private func factsValue(_ key: String) -> Any? {
        guard let facts = transcript?.facts, let data = try? JSONEncoder().encode(facts),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return raw[key]
    }

    // MARK: Building items

    private func build() -> [Item] {
        guard let transcript else { return [] }
        rows = settledRows()
        let tail = transcript.tail
        let reasoning = (tail?.openBlock?.rawValue == "thinking" || tail?.thinkingClosing == true) && received.isEmpty
        let last = blocks.last
        let spoke = (last?.type == "assistant" || last?.type == "thinking") && !(last?.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let parked = hub?.needs.parked[transcript.id]?.count ?? 0
        isCompacting = factsValue("sdkStatus") as? String == "compacting"
        let indicating = tail?.busy == true && !spoke
            && !(last?.type == "tool.use" && last?.toolStatus == "pending")
            && parked == 0
            && !isCompacting
            && last?.string("sendFailed") == nil
            && received.isEmpty && tail?.currentTool == nil && tail?.openBlock?.rawValue != "tool" && tail?.thinkingClosing != true
        let liveOn = reasoning || !received.isEmpty || indicating
        // The live row's generation: a new one each time the tail opens again.
        if liveOn, !liveWasOn { generation += 1 }
        let liveKey = "live:\(generation)"
        // A streamed answer that landed as its message keeps the live row's cells.
        if liveWasOn, !liveOn, !lastAnswer.isEmpty,
           let landed = blocks.last(where: { $0.type == "assistant" }),
           landed.content.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix(lastAnswer.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)),
           keys[landed.id] == nil {
            keys[landed.id] = "live:\(generation)"
        }
        // Reasoning the reader watched lands as its own row and folds shut there.
        if liveWasOn, reasoningEnded, !reasoning, let thought = blocks.last(where: { $0.type == "thinking" }), !known.contains(thought.id) {
            folding = thought.id
        }
        reasoningEnded = reasoning
        liveWasOn = liveOn
        lastAnswer = liveOn ? received : lastAnswer

        var builder = Builder(agentName: env.agentName, cache: env.cache)
        builder.keys = keys
        var (out, rail) = builder.items(rows)
        for i in out.indices {
            if case let .thinking(r) = out[i].kind, r.key == "think:\(folding ?? "")" {
                out[i] = Item(id: out[i].id, top: out[i].top, kind: .thinking(.init(key: r.key, text: r.text, live: false, folding: true)),
                              print: out[i].print + "folding")
            }
            out[i].print += fleetPrint(out[i])
        }

        // The tail: the sends drawn ahead of it, the live row, the call in flight, the rest.
        let tool = tail?.currentTool.flatMap { glance -> (String, String)? in
            Self.called(blocks, glance.toolId) ? nil : (glance.name, glance.glance)
        }
        let hasTail = liveOn || tool != nil
        if hasTail, ahead == nil { ahead = Set(queued.map(\.id)) } else if !hasTail { ahead = nil }
        var tailVoices = voices
        func queuedItems(_ ahead: Bool) -> [Item] {
            let rows = queued.filter { (self.ahead?.contains($0.id) ?? false) == ahead }.map { block -> Row in
                .queued(key: block.id, block: block, grouped: tailVoices.advance(Fold.voice(of: block)))
            }
            let built = builder.items(rows, railAbove: rail)
            rail = built.railBelow
            return built.items
        }
        out += queuedItems(true)
        if reasoning || (indicating && received.isEmpty) {
            _ = tailVoices.advance(.acts)
            out.append(Item(id: liveKey, top: rail ? 0 : Space.space4,
                            kind: .thinking(.init(key: "think:\(liveKey)", text: reasoning ? (tail?.thinkingStream ?? "") : "", live: true, folding: false)),
                            print: (tail?.thinkingStream ?? "") + "\(reasoning)"))
            rail = true
        } else if !received.isEmpty {
            let grouped = tailVoices.advance(.says)
            var sources = liveSources
            let tailText = currentTail
            if !tailText.isEmpty || sources.isEmpty {
                sources.append(.init(text: tailText, joinsAbove: splitter.tailContinues))
            }
            out += builder.pieces(id: liveKey, sources: sources, grouped: grouped, date: nil, streaming: true)
            rail = false
        }
        if let (name, glance) = tool {
            _ = tailVoices.advance(.acts)
            out.append(Item(id: "tool:\(tail?.currentTool?.toolId ?? name)", top: rail ? 0 : Space.space4,
                            kind: .livetool(name: name, glance: glance), print: name + glance))
            rail = true
        }
        out += queuedItems(false)

        if out.isEmpty {
            out = [transcript.loading ? Item(id: "notice:loading", top: 0, kind: .notice("Loading transcript…"), print: "loading")
                : Item(id: "notice:empty", top: 0, kind: .empty, print: "empty")]
        }
        return out
    }

    /// What a delegate or run row reads off the fleet, so it redraws when that moves.
    private func fleetPrint(_ item: Item) -> String {
        guard let fleet = hub?.fleet else { return "" }
        switch item.kind {
        case let .delegate(block):
            guard let id = block.string("delegateInstanceId") else { return "" }
            let row = fleet.byId[id]
            let pulse = fleet.pulse(id)
            let open = env.isOpen(block.disclosureKey)
            let inner = open ? (hub?.sessions.transcripts[id]).map { "\($0.blockRevision)\($0.loading)\($0.tail?.streaming.count ?? 0)" } ?? "" : ""
            return "\(row?.status.rawValue ?? "")\(row?.lastError ?? "")\(pulse?.activity.rawValue ?? "")\(pulse?.currentTool?.glance ?? "")\(open)\(inner)\(blocks.count)"
        case let .run(block, anchored):
            guard let id = anchored ?? Fold.startedRun(block), let run = fleet.runs[id] else { return "" }
            let steps = hub?.workflowRuns.details[id]?.run.map { "\($0.steps.count)" } ?? ""
            return "\(run.status.rawValue)\(run.endedAt ?? 0)\(run.failure ?? "")\(steps)"
        case let .peer(block) where block.string("reportKind") != nil:
            return fleet.rows.contains { $0.id.hasPrefix(block.string("peerSession") ?? "-") } ? "linked" : ""
        default:
            return ""
        }
    }

    /// rows.ts `called`: the call in flight already has its message.
    private static func called(_ blocks: [Block], _ toolId: String) -> Bool {
        for block in blocks.reversed() {
            if block.type == "user" { return false }
            if (block.toolId ?? block.toolCallId) == toolId { return true }
        }
        return false
    }

    private var currentTail = ""

    // MARK: The frame

    fileprivate func frame(_ link: CADisplayLink) {
        let now = CACurrentMediaTime()
        let dt = lastTick == 0 ? link.targetTimestamp - link.timestamp : min(0.1, now - lastTick)
        lastTick = now
        if cursor < characters.count {
            let pending = Double(characters.count) - shown
            let oldest = arrivals.first { $0.end > cursor }?.time ?? now
            if UIAccessibility.isReduceMotionEnabled || now - oldest > 2 {
                shown = Double(characters.count)
            } else {
                rate += (pending / 0.18 - rate) * (1 - exp(-dt / 0.25))
                rate = min(900, max(12, rate))
                var step = rate * dt
                if transcript?.tail?.busy != true || now - lastArrival >= 0.2 {
                    let deadline = drainDeadline ?? now + 0.4
                    drainDeadline = deadline
                    step = max(step, pending * dt / max(dt, deadline - now))
                }
                shown = min(Double(characters.count), shown + step)
            }
            var end = Int(shown)
            while end > cursor, end < characters.count {
                let a = characters[end - 1], b = characters[end]
                if (a == "*" && b == "*") || (a == "`" && b == "`") || (a == "]" && b == "(") { end -= 1 } else { break }
            }
            if end > cursor {
                cursor = end
                arrivals.removeAll { $0.end <= cursor }
                let pieces = splitter.split(String(characters[..<end]))
                let joins = splitter.joins
                for (i, piece) in pieces.settled.enumerated() {
                    let above = liveSources.last?.joinsBelow ?? false
                    liveSources.append(.init(text: piece, joinsAbove: above, joinsBelow: i < joins.count ? joins[i] : false))
                }
                currentTail = pieces.tail
                dirty = true
            }
        }
        if received.isEmpty, !currentTail.isEmpty { currentTail = "" }
        if dirty { dirty = false; commit() }
        restoreIfReady()
        // The tail is not held under the reader's finger, nor while the list
        // coasts: a slow drag moves less in a frame than the distance that lets
        // go of the tail, and pinning it each frame would never let it leave.
        if following, !gliding, !collection.isDragging, !collection.isDecelerating { latest() }
        let visible = collection.visibleCells
        let seen = collection.convert(visibleBox, to: nil)
        for cell in visible {
            (cell as? HostCell<PieceView>)?.row.fade(now)
            (cell as? HostCell<ThinkingView>)?.row.fade(now)
            (cell as? HostCell<DelegateView>)?.row.track(in: seen)
        }
        honourTray()
        updateDock()
    }

    private func commit() {
        let interval = signposter.beginInterval("transcriptFrame")
        defer { signposter.endInterval("transcriptFrame", interval) }
        env.watched = landed && window != nil
        let built = build()
        // A named state stands in the area instead of the transcript (SessionPane `namedState`).
        if let transcript {
            let blank = !transcript.loading && transcript.fault == nil && !transcript.missing && blocks.isEmpty
                && queued.isEmpty && hub != nil && hub?.fleet.byId[transcript.id] == nil
            let named: PaneState.State? = transcript.fault.map { .fault($0) }
                ?? (transcript.missing ? .missing(transcript.id) : blank ? .blank : nil)
            if let named { paneState.show(named) }
            paneState.isHidden = named == nil
            collection.isHidden = named != nil
        }
        var next: [String: Item] = [:]
        for item in built { next[item.id] = item }
        let ids = built.map(\.id)
        let old = dataSource.snapshot()
        let previous = Set(old.itemIdentifiers)
        var changed: [String] = []
        for item in built where prints[item.id] != item.print {
            if previous.contains(item.id) { changed.append(item.id) }
        }
        items = next
        prints = Dictionary(uniqueKeysWithValues: built.map { ($0.id, $0.print) })
        // Rows that arrive while the reader watches are drawn arriving (Row.svelte).
        if env.watched {
            let now = CACurrentMediaTime()
            for (slot, id) in ids.filter({ !known.contains($0) }).enumerated() {
                arriving[id] = now + Double(min(slot, 3)) * Motion.durStagger
            }
        }
        known.formUnion(ids)
        if old.itemIdentifiers == ids, changed.isEmpty { return }
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems(ids)
        snapshot.reconfigureItems(changed)
        let follow = following
        let grew = env.watched && ids.count > old.itemIdentifiers.count && follow && !UIAccessibility.isReduceMotionEnabled
        let from = collection.contentOffset
        // Rows shifted in front (older history) never move the reader: the
        // first row on screen keeps its place (Transcript `frontOnly`, `restore`).
        let anchor: (id: String, into: CGFloat)? = follow || !landed ? nil : collection.indexPathsForVisibleItems.sorted().first.flatMap { index in
            guard let id = dataSource.itemIdentifier(for: index), let frame = collection.layoutAttributesForItem(at: index)?.frame else { return nil }
            return (id, collection.contentOffset.y - frame.minY)
        }
        dataSource.apply(snapshot, animatingDifferences: false) { [weak self] in
            guard let self else { return }
            collection.layoutIfNeeded()
            if let anchor, let index = dataSource.indexPath(for: anchor.id),
               let frame = collection.layoutAttributesForItem(at: index)?.frame,
               abs(collection.contentOffset.y - (frame.minY + anchor.into)) > 0.5 {
                collection.contentOffset.y = frame.minY + anchor.into
            }
            if let id = folding, let index = dataSource.indexPath(for: id),
               let cell = collection.cellForItem(at: index) as? HostCell<ThinkingView> {
                folding = nil
                animate(cell.row, open: false, in: cell)
            }
            if !landed, transcript?.loading == false { landed = true }
            guard follow else { return }
            if grew {
                // The rows above make room on the place's clock rather than jumping.
                collection.contentOffset = from
                gliding = true
                let animator = Motion.easeOut.animator(Motion.durRail) { self.scrollToBottom() }
                animator.addCompletion { _ in self.gliding = false; self.latest() }
                animator.startAnimation()
            } else { latest() }
        }
        announce(built)
    }

    public func collectionView(_: UICollectionView, willDisplay cell: UICollectionViewCell, forItemAt index: IndexPath) {
        guard let id = dataSource.itemIdentifier(for: index), let start = arriving.removeValue(forKey: id) else { return }
        let content = cell.contentView
        let reduced = UIAccessibility.isReduceMotionEnabled
        content.alpha = 0
        content.transform = reduced ? .identity : CGAffineTransform(translationX: 0, y: 3)
        // The place opens first (--dur-rail), then the content fades up into it (--dur-menu).
        let delay = max(0, start - CACurrentMediaTime()) + (reduced ? 0 : Motion.durRail)
        let animator = Motion.easeOut.animator(reduced ? Motion.durControl : Motion.durMenu) {
            content.alpha = 1
            content.transform = .identity
        }
        animator.startAnimation(afterDelay: delay)
        // A compaction's wave draws in, and Caw comes in, on the same clock.
        if !reduced { (cell as? HostCell<CompactionDividerView>)?.row.arrive(after: delay) }
    }

    public func collectionView(_: UICollectionView, didEndDisplaying cell: UICollectionViewCell, forItemAt _: IndexPath) {
        cell.contentView.layer.removeAllAnimations()
        cell.contentView.alpha = 1
        cell.contentView.transform = .identity
        // A delegate's card off the screen is the card leaving (tray.svelte.ts `trayCard`).
        (cell as? HostCell<DelegateView>)?.row.untrack()
    }

    // MARK: Disclosure

    private func toggle(_ key: String, from view: UIView) {
        guard let row = view as? Disclosing else { return }
        if open.contains(key) { open.remove(key) } else { open.insert(key) }
        // A disclosure the reader opens holds its header where they pressed it and
        // opens downward: the transcript lets go of the tail (Transcript `onrevealstart`).
        if !row.disclosed { following = false }
        let cell = sequence(first: view as UIView, next: { $0.superview }).first { $0 is UICollectionViewCell } as? UICollectionViewCell
        animate(row, open: !row.disclosed, in: cell)
        dirty = true
    }

    /// A body grows open (--dur-reveal) or folds shut (--dur-exit) on
    /// --ease-out, its row's height on the same clock; at once under Reduce Motion.
    private func animate(_ row: Disclosing, open: Bool, in cell: UICollectionViewCell?) {
        // Main-actor closures from a main-actor view, run on the main actor by the animator.
        nonisolated(unsafe) let (layout, done) = row.toggled(open: open)
        let change: @MainActor () -> Void = {
            layout()
            cell?.contentView.layoutIfNeeded()
            cell?.invalidateIntrinsicContentSize()
            self.collection.layoutIfNeeded()
        }
        guard !UIAccessibility.isReduceMotionEnabled, window != nil else {
            change(); done(); return
        }
        let animator = Motion.easeOut.animator(open ? Motion.durReveal : Motion.durExit, animations: change)
        animator.addCompletion { _ in done() }
        animator.startAnimation()
    }

    /// A compaction divider's 44pt reach under a finger runs past its own row
    /// into the margin above the next (`.touch-hit`): a touch there that
    /// lands on no row's content is the divider's.
    override public func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let hit = super.hitTest(point, with: event) else { return nil }
        guard hit === collection || hit is UICollectionViewCell || hit.superview is UICollectionViewCell else { return hit }
        for case let cell as HostCell<CompactionDividerView> in collection.visibleCells {
            if let control = cell.row.control, cell.row.reach(in: self).contains(point) { return control }
        }
        return hit
    }

    // MARK: Following and position

    private var bottomOffset: CGFloat {
        max(-collection.adjustedContentInset.top, collection.contentSize.height - collection.bounds.height + collection.adjustedContentInset.bottom)
    }

    private func scrollToBottom() {
        collection.contentOffset = CGPoint(x: 0, y: bottomOffset)
    }

    public func latest() {
        pendingPosition = nil
        following = true
        farFromLatest = false
        scrollToBottom()
    }

    /// Jump to latest (Transcript `jump`): within three screens one smooth
    /// glide, past it — or under Reduce Motion — an instant landing.
    private func jump() {
        let distance = bottomOffset - collection.contentOffset.y
        if UIAccessibility.isReduceMotionEnabled || distance > 3 * collection.bounds.height {
            latest()
            return
        }
        following = true
        farFromLatest = false
        gliding = true
        let animator = Motion.easeOut.animator(Motion.durPanel) { self.scrollToBottom() }
        animator.addCompletion { _ in self.gliding = false; self.latest() }
        animator.startAnimation()
    }

    public var restorationPosition: TranscriptPosition {
        if let pendingPosition { return pendingPosition }
        guard !following, let index = collection.indexPathsForVisibleItems.sorted().first,
              let id = dataSource.itemIdentifier(for: index),
              let frame = collection.layoutAttributesForItem(at: index)?.frame else {
            return TranscriptPosition(following: following, anchor: nil, offset: 0)
        }
        return TranscriptPosition(following: false, anchor: id, offset: collection.contentOffset.y - frame.minY)
    }

    public func restorePosition(_ position: TranscriptPosition) {
        following = position.following
        pendingPosition = position
        restoreIfReady()
    }

    private func restoreIfReady() {
        guard let position = pendingPosition, dataSource.snapshot().numberOfItems > 0 else { return }
        if position.following { pendingPosition = nil; latest(); return }
        guard let id = position.anchor, let index = dataSource.indexPath(for: id),
              let frame = collection.layoutAttributesForItem(at: index)?.frame else { return }
        pendingPosition = nil
        collection.setContentOffset(CGPoint(x: 0, y: frame.minY + position.offset), animated: false)
    }

    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView.isDragging || scrollView.isDecelerating else { return }
        pendingPosition = nil
        gliding = false
        revealing = nil
        place(scrollView)
    }

    /// Where the reader stands against the tail: following it, or far enough
    /// from it for "Jump to latest".
    private func place(_ scrollView: UIScrollView) {
        // From the tail as the reader can reach it: past the inset the composer stands in.
        let distance = scrollView.contentSize.height + scrollView.adjustedContentInset.bottom - scrollView.contentOffset.y - scrollView.bounds.height
        following = distance <= Space.space8
        // Hysteresis: up past three quarters of a screen, and it stays until back at the tail.
        farFromLatest = !following && (farFromLatest || distance > 0.75 * scrollView.bounds.height)
    }

    // MARK: The docks

    private func placeDock() {
        for pill in [latestButton, catchUp, compacting] {
            pill.translatesAutoresizingMaskIntoConstraints = false
            pill.alpha = 0
            pill.isHidden = true
            addSubview(pill)
        }
        latestButton.addAction(UIAction { [weak self] _ in self?.jump() }, for: .touchUpInside)
        catchUp.isUserInteractionEnabled = false
        compacting.isUserInteractionEnabled = false
        NSLayoutConstraint.activate([
            latestButton.centerXAnchor.constraint(equalTo: centerXAnchor),
            latestButton.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -Space.space4),
            catchUp.centerXAnchor.constraint(equalTo: centerXAnchor),
            catchUp.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -Space.space4),
            compacting.centerXAnchor.constraint(equalTo: centerXAnchor),
            compacting.topAnchor.constraint(equalTo: topAnchor, constant: Space.space3),
        ])
    }

    private func updateDock() {
        let rowsDrawn = !rows.isEmpty
        latestButton.show(landed && farFromLatest && rowsDrawn)
        catchUp.show(transcript?.loading == true && rowsDrawn)
        compacting.show(isCompacting)
    }

    /// The session's own word: `compacting` (read as the items are built).
    private var isCompacting = false

    // MARK: Speaking

    private var announced = Set<String>()
    private var wasBusy = false

    /// The live region (Transcript `announcement`): one coarse sentence for
    /// what arrived, once landed; "Turn finished" when the turn ends.
    private func announce(_ built: [Item]) {
        guard landed, window != nil else {
            announced.formUnion(built.map(\.id))
            wasBusy = transcript?.tail?.busy == true
            return
        }
        var phrase = ""
        for item in built where !announced.contains(item.id) {
            announced.insert(item.id)
            switch item.kind {
            case let .piece(piece) where !piece.streaming && piece.header != nil: phrase = "Agent replied"
            case let .livetool(name, _): phrase = "\(name) running"
            default: break
            }
        }
        let busy = transcript?.tail?.busy == true
        if wasBusy, !busy { phrase = "Turn finished" }
        wasBusy = busy
        if !phrase.isEmpty { UIAccessibility.post(notification: .announcement, argument: phrase) }
    }

    private final class DisplayTarget: NSObject {
        weak var owner: TranscriptView?
        init(_ owner: TranscriptView) { self.owner = owner }
        @objc func tick(_ link: CADisplayLink) { owner?.frame(link) }
    }
}

/// The floating surfaces over the list's foot (Latest.svelte, CatchUp.svelte)
/// and top (the compacting pill): raised, hairline, --shadow-overlay; they
/// rise in over --dur-panel and out over --dur-exit.
final class DockPill: UIControl {
    private let beat = Dot(Size.txBeatLg, color: Palette.statusLiveInk)
    private var shown = false

    init(glyph: Glyph?, title: String, pill: Bool = false) {
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = pill ? Size.cBtnHLg : Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowOverlay
        var views: [UIView] = []
        if let glyph { views.append(GlyphView(glyph, size: Size.iconMd, tint: Palette.inkStrong)) } else { views.append(beat) }
        let label = LineLabel(hug: .required, resist: .required)
        label.attributedText = Styled.string(title, TypeScale.typeLabel, color: Palette.inkStrong)
        views.append(label)
        let row = railLine(views)
        row.isUserInteractionEnabled = false
        pin(row, insets: UIEdgeInsets(top: Space.space2, left: pill ? Space.space4 : Space.space3, bottom: Space.space2, right: pill ? Space.space4 : Space.space3))
        isAccessibilityElement = true
        accessibilityLabel = title
        accessibilityTraits = glyph == nil ? .updatesFrequently : .button
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (pill: DockPill, _: UITraitCollection) in pill.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("built in code") }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    override var isHighlighted: Bool {
        didSet {
            backgroundColor = isHighlighted ? Palette.surfaceHover : Palette.surfaceRaised
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            Motion.easeOut.animator(Motion.durToggle) {
                self.transform = self.isHighlighted ? CGAffineTransform(scaleX: Motion.pressScale, y: Motion.pressScale) : .identity
            }.startAnimation()
        }
    }

    func show(_ visible: Bool) {
        guard visible != shown else { return }
        shown = visible
        if visible { isHidden = false; beat.beat() }
        let rise = UIAccessibility.isReduceMotionEnabled ? .identity : CGAffineTransform(translationX: 0, y: Motion.popRise)
        if visible { transform = rise; alpha = 0 }
        let animator = Motion.easeOut.animator(visible ? Motion.durPanel : Motion.durExit) {
            self.alpha = visible ? 1 : 0
            self.transform = visible ? .identity : rise
        }
        animator.addCompletion { _ in if !self.shown { self.isHidden = true } }
        animator.startAnimation()
    }
}
