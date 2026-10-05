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
    /// How many rows of the first screen the list holds, until it holds every
    /// row. A screen of rows built and measured in one go held the main thread
    /// a quarter of a second, so a first screen is built a few rows a frame
    /// from where the reader is to stand, out of sight until it is whole, and
    /// the rest (rows off the screen, which cost nothing) joins it at once.
    private var fed: Int? = 0
    /// How many of the hub's blocks, counted from the newest, the list draws so far.
    private var taken = 0
    /// Blocks of history a frame adds.
    private static let stretch = 80
    /// Whether the last commit added a row to a first screen.
    private var feeding = false
    /// The items the last commit drew from, for a first screen's next row.
    private var drawn: [Item] = []
    /// What a frame of a first screen may take of the main thread's turn.
    private static let budget = 0.04
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
    /// Whether the view was on screen at the last frame.
    private var wasOnScreen = false
    private let latestButton = DockPill(glyph: .arrowDown, title: "Jump to latest")
    private let catchUp = DockPill(glyph: nil, title: "Catching up…")
    private let compacting = DockPill(glyph: nil, title: "Compacting context…", pill: true)
    private let signposter = OSSignposter(subsystem: "dev.cawco.app", category: "Transcript")

    /// The list's layout, which is asked where the list stands when rows join it.
    private final class Layout: UICollectionViewCompositionalLayout {
        /// Where the list is to stand once an update's rows are in; nil leaves it.
        var stand: (() -> CGFloat?)?

        /// The offset that stands the list's foot at the foot of its view.
        var foot: CGFloat {
            guard let view = collectionView else { return 0 }
            let inset = view.adjustedContentInset
            return max(-inset.top, collectionViewContentSize.height - view.bounds.height + inset.bottom)
        }

        /// The list is moved to where it is to stand as soon as the rows have
        /// their places and before any is built, so only rows it shows are.
        override func prepare() {
            super.prepare()
            settle()
        }

        /// iOS 18 reads the list's place after it has been told of the update,
        /// not after `prepare`: the list is stood there too.
        override func prepare(forCollectionViewUpdates updates: [UICollectionViewUpdateItem]) {
            super.prepare(forCollectionViewUpdates: updates)
            settle()
        }

        private func settle() {
            guard let view = collectionView, let y = stand?(), abs(view.contentOffset.y - y) > 0.5 else { return }
            view.contentOffset.y = y
        }

        override func targetContentOffset(forProposedContentOffset proposed: CGPoint) -> CGPoint {
            guard let y = stand?() else { return super.targetContentOffset(forProposedContentOffset: proposed) }
            return CGPoint(x: proposed.x, y: y)
        }
    }

    private let layout: Layout

    private static var warmed = false

    /// What the first row of the first transcript otherwise pays for under the
    /// reader, once an app's life: the code grammars, and the text system (its
    /// classes, the faces, the Markdown parser). Each takes a turn of the main
    /// thread of its own while the first page is still on its way.
    private static func warm() {
        guard !warmed else { return }
        warmed = true
        Highlight.warm()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            for block in MarkdownRender.blocks("Warm **up** `code`") {
                let view = blockView(block)
                _ = view.systemLayoutSizeFitting(CGSize(width: 320, height: 0), withHorizontalFittingPriority: .required,
                                                 verticalFittingPriority: .fittingSizeLevel)
            }
        }
    }

    public override init(frame: CGRect) {
        let layout = Layout { _, environment in
            let size = NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44))
            let section = NSCollectionLayoutSection(group: .vertical(layoutSize: size, subitems: [NSCollectionLayoutItem(layoutSize: size)]))
            // The ledger's asymmetric inset: 25 at the start, 21 at the end; 18 both 900pt wide and under.
            let narrow = environment.container.contentSize.width <= 900
            section.contentInsets = .init(top: 0, leading: narrow ? Space.space5 : Space.space7, bottom: Space.space5,
                                          trailing: narrow ? Space.space5 : Space.space6)
            return section
        }
        self.layout = layout
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        super.init(frame: frame)
        Self.warm()
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
            view.settled = nil
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
                // A row spans the list less its section's inset (the layout above).
                let width = Double(collection.bounds.width)
                let inset = width <= 900 ? 2 * Space.space5 : Space.space7 + Space.space6
                let fit: CGFloat? = width > inset ? CGFloat(width - inset) : nil
                (cell.row as? PieceView)?.fitWidth = fit
                (cell.row as? UserTurnView)?.fitWidth = fit
                cell.configure(item)
                Pace.row()
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
            case .notice, .retry, .empty: return view.dequeueConfiguredReusableCell(using: notice, for: index, item: id)
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
            Pace.watch()
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

    /// Whether any of this view is inside its window's bounds.
    private var onScreen: Bool {
        guard let window else { return false }
        return window.bounds.intersects(convert(bounds, to: nil))
    }

    /// Whether the reader can see any of this view: inside the window, and
    /// nothing above it hidden (a pane group hides the panes it is not showing).
    private var inView: Bool {
        guard onScreen else { return false }
        return !sequence(first: self as UIView, next: { $0.superview }).contains { $0.isHidden }
    }

    /// Panes that are off screen with changes they have not drawn.
    private static let owing = NSHashTable<TranscriptView>.weakObjects()
    private static var watchingOwing = false

    /// Ends every turn of the main thread, before Core Animation takes the
    /// screen's next state, by drawing what a pane owes if that turn brought
    /// it on screen: a swipe's first movement, a tab's switch. The pane's
    /// first frame in view is then its current one, never the one it kept.
    private static func watchOwing() {
        guard !watchingOwing else { return }
        watchingOwing = true
        // Core Animation commits at order 2,000,000 of the same activities.
        let activities = CFRunLoopActivity([.beforeWaiting, .exit]).rawValue
        let observer = CFRunLoopObserverCreateWithHandler(nil, activities, true, 1_999_000) { _, _ in
            MainActor.assumeIsolated {
                for view in owing.allObjects where view.inView || !view.dirty {
                    owing.remove(view)
                    view.drawOwed()
                }
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
    }

    private func drawOwed() {
        guard dirty else { return }
        dirty = false
        commit()
        collection.layoutIfNeeded()
        let box = convert(bounds, to: nil)
        Self.tray.info("pane \(self.env.sessionId.prefix(8), privacy: .public) drew what it owed as it came on screen, at x \(Double(box.minX), format: .fixed(precision: 1)) of \(Double(self.window?.bounds.width ?? 0), format: .fixed(precision: 0))")
    }

    /// The list's view: its bounds less what the bars and the composer cover.
    private var visibleBox: CGRect { collection.bounds.inset(by: collection.adjustedContentInset) }

    /// What the tray asked of this session since the last frame: a report to
    /// bring into view (Transcript.svelte `trayReveal`), and its news to say
    /// (`trayNews`).
    private func honourTray() {
        let tray = DelegateTrayState.shared
        let id = env.sessionId
        // A report is brought into view once the history it may stand in is in the list.
        if taken >= blocks.count, let want = tray.reveal[id] {
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
        // A first screen waiting on the view's size has it now.
        if fed != nil { dirty = true }
    }

    // MARK: Reading the transcript

    public func configure(_ transcript: SessionTranscript) {
        // Read again only when the hub's facts changed: a transcript is handed
        // in on every frame of a streaming reply.
        if transcript.facts != self.transcript?.facts { facts = nil }
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
        // Read here so the screen hears of them: a page on its way, one that
        // failed, and whether there is any older left.
        _ = (transcript.loadingOlder, transcript.olderFault, transcript.cursor)
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
        // History joins the list a stretch a frame, newest first: a long
        // session's older page set as Markdown in one go was 80 ms of a frame
        // for rows far above the reader. A reader restored to a row is given
        // all of it, so the row is there to stand at.
        if taken < blocks.count {
            let anchored = pendingPosition.map { !$0.following } ?? false
            taken = anchored ? blocks.count : min(blocks.count, taken + Self.stretch)
            if taken < blocks.count { dirty = true }
        }
        // The same blocks fold into the same rows: a long session's are folded
        // when its blocks change, not on every frame its tail or its fleet moves.
        let stamp = "\(revision)|\(taken)|\(bypass)"
        if let folded, folded.stamp == stamp {
            voices = folded.voices
            return folded.rows
        }
        let drawn = blocks.suffix(taken).filter { block in
            !(Fold.isQuestion(block) && block.toolStatus == "pending" && !bypass)
                && block.type != "send.ref" && block.type != "system.init"
        }
        var voices = Voices()
        let rows = Fold.rows(drawn, branches: branches, voices: &voices)
        self.voices = voices
        folded = (stamp, rows, voices)
        return rows
    }

    /// The settled rows as last folded, and what they were folded from.
    private var folded: (stamp: String, rows: [Row], voices: Voices)?
    /// The settled rows' items as last built, what they were built from, and
    /// which of them read the fleet (`fleetPrint`).
    private var settled: (stamp: String, items: [Item], rail: Bool, fleet: [Int])?

    private func factsValue(_ key: String) -> Any? {
        if let facts { return facts[key] }
        let read = transcript?.facts.flatMap { try? JSONEncoder().encode($0) }
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        facts = read
        return read[key]
    }

    /// The session's facts as the hub sent them, read once per transcript handed in.
    private var facts: [String: Any]?

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
        // Built when the rows, the landed answers' keys or the fold in hand
        // change; a frame that only moves the tail takes them as they are.
        let stamp = "\(folded?.stamp ?? "")|\(keys.count)|\(folding ?? "")|\(env.agentName)"
        let rebuilt = settled?.stamp != stamp
        if rebuilt {
            var (items, rail) = builder.items(rows)
            var fleet: [Int] = []
            for i in items.indices {
                if case let .thinking(r) = items[i].kind, r.key == "think:\(folding ?? "")" {
                    items[i] = Item(id: items[i].id, top: items[i].top, kind: .thinking(.init(key: r.key, text: r.text, live: false, folding: true)),
                                    print: items[i].print + "folding")
                }
                switch items[i].kind {
                case .delegate, .run, .peer: fleet.append(i)
                default: break
                }
            }
            settled = (stamp, items, rail, fleet)
        }
        var out = settled?.items ?? []
        var rail = settled?.rail ?? false
        // Read once a build: a fleet row is a large value, and going through
        // them all for every report in a long session was most of a build.
        let sessions = (settled?.fleet.isEmpty ?? true) ? [] : (hub?.fleet.byId.keys).map(Array.init) ?? []
        for i in settled?.fleet ?? [] { out[i].print += fleetPrint(out[i], sessions: sessions) }

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
        // Above the first loaded row while an older page is read, the
        // transcript's loading line; where one failed, why, to press again.
        if taken >= blocks.count, !rows.isEmpty {
            if let fault = transcript.olderFault {
                out.insert(Item(id: "notice:older", top: 0, kind: .retry(fault.message), print: "failed" + fault.message), at: 0)
            } else if transcript.loadingOlder {
                out.insert(Item(id: "notice:older", top: 0, kind: .notice("Loading transcript…"), print: "older"), at: 0)
            }
        }
        // The Markdown this build did not draw from is let go (BlockCache
        // `sweep`): turns that changed, lists that were closed, history that
        // was compacted away.
        if rebuilt {
            let swept = env.cache.sweep()
            if swept.dropped > 0 { Pace.swept(env.sessionId, held: swept.held, dropped: swept.dropped) }
        }
        return out
    }

    /// What a delegate or run row reads off the fleet, so it redraws when that moves.
    private func fleetPrint(_ item: Item, sessions: [String]) -> String {
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
            let peer = block.string("peerSession") ?? "-"
            return sessions.contains { $0.hasPrefix(peer) } ? "linked" : ""
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
        // A pane beside the one being read keeps what it has until it comes on
        // screen: a long session's every change is a frame's worth of work, and
        // it was taken out of the reply the reader was watching stream. Its
        // first screen is still built where it stands, so it is there to come to.
        // What it owes is drawn before the first frame it shows in (`drawOwed`).
        if dirty {
            if inView || !landed { dirty = false; commit() } else { Self.owing.add(self); Self.watchOwing() }
        }
        // A first screen takes a row at a time for as long as the frame has
        // time for one: rows cost anything from a millisecond to a frame's worth.
        while feeding, CACurrentMediaTime() - now < Self.budget / 2 {
            collection.layoutIfNeeded()
            commit(fresh: false)
        }
        restoreIfReady()
        // The tail is not held under the reader's finger, nor while the list
        // coasts: a slow drag moves less in a frame than the distance that lets
        // go of the tail, and pinning it each frame would never let it leave.
        if following, !gliding, !collection.isDragging, !collection.isDecelerating { latest() }
        let visible = collection.visibleCells
        // A pane beside the one being read is laid out but never painted: what
        // draws itself once (Caw on a divider) draws when the pane comes on screen.
        let shown = onScreen
        if shown, !wasOnScreen {
            for cell in visible { (cell as? HostCell<CompactionDividerView>)?.row.cameOnScreen() }
        }
        wasOnScreen = shown
        let seen = collection.convert(visibleBox, to: nil)
        for cell in visible {
            (cell as? HostCell<PieceView>)?.row.fade(now)
            (cell as? HostCell<ThinkingView>)?.row.fade(now)
            (cell as? HostCell<DelegateView>)?.row.track(in: seen)
        }
        honourTray()
        askOlder()
        updateDock()
        // The rows this frame asked for are built inside it, so its cost is whole.
        collection.layoutIfNeeded()
        let took = CACurrentMediaTime() - now
        Pace.spent(took, in: env.sessionId, items: items.count, cells: collection.visibleCells.count)
    }

    /// `fresh`: the items are built again from the transcript; a first
    /// screen's next row within a frame is taken from the ones just built.
    private func commit(fresh: Bool = true) {
        feeding = false
        let interval = signposter.beginInterval("transcriptFrame")
        defer { signposter.endInterval("transcriptFrame", interval) }
        // Watched means on screen (Transcript `active`): a pane beside the one
        // being read is in the window too, and what lands in it is simply there
        // when the reader comes to it, not an arrival played where nothing draws.
        env.watched = landed && onScreen
        if fresh { drawn = build() }
        let built = drawn
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
        let all = built.map(\.id)
        let ids = firstScreen(of: all)
        collection.alpha = fed == nil || rows.isEmpty ? 1 : 0
        let old = dataSource.snapshot()
        let previous = Set(old.itemIdentifiers)
        var changed: [String] = []
        for item in built where prints[item.id] != item.print {
            if previous.contains(item.id) { changed.append(item.id) }
        }
        items = next
        prints = Dictionary(uniqueKeysWithValues: built.map { ($0.id, $0.print) })
        // Rows that arrive while the reader watches are drawn arriving (Row.svelte):
        // the ones that join after rows already here. History joining in front
        // is simply there when the reader scrolls up to it.
        if env.watched {
            let now = CACurrentMediaTime()
            let first = ids.firstIndex(where: known.contains) ?? 0
            for (slot, id) in ids.enumerated().filter({ $0.offset > first && !known.contains($0.element) }).map(\.element).enumerated() {
                arriving[id] = now + Double(min(slot, 3)) * Motion.durStagger
            }
        }
        known.formUnion(all)
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
        // The place is kept by a row of the conversation: the line above the
        // first one (a page being read, or one that failed) comes and goes.
        let anchor: (id: String, into: CGFloat)? = follow || !landed ? nil : collection.indexPathsForVisibleItems.sorted().lazy.compactMap { index in
            guard let id = self.dataSource.itemIdentifier(for: index), id != "notice:older",
                  let frame = self.collection.layoutAttributesForItem(at: index)?.frame else { return nil }
            return (id, self.collection.contentOffset.y - frame.minY)
        }.first
        // How many rows this update puts in front of the first row the list had.
        let joined = old.itemIdentifiers.first(where: { $0 != "notice:older" }).flatMap { ids.firstIndex(of: $0) }
            .map { $0 - (ids.first == "notice:older" ? 1 : 0) } ?? 0
        // A first screen built down from a restored anchor stands at it.
        var pivot: (id: String, into: CGFloat)?
        if let position = pendingPosition, !position.following, let id = position.anchor {
            pivot = (id, CGFloat(position.offset))
        }
        let settle = { [weak self] in
            guard let self else { return }
            collection.layoutIfNeeded()
            if let anchor, let index = dataSource.indexPath(for: anchor.id),
               let frame = collection.layoutAttributesForItem(at: index)?.frame {
                let landed = frame.minY - collection.contentOffset.y
                if abs(collection.contentOffset.y - (frame.minY + anchor.into)) > 0.5 {
                    collection.contentOffset.y = frame.minY + anchor.into
                }
                // Rows joined in front of the reader: where the row they were at stands, before and after.
                if joined > 0 {
                    Self.tray.info("place kept in \(self.env.sessionId.prefix(8), privacy: .public): \(joined) rows joined in front; the first row in view stood at \(Double(-anchor.into), format: .fixed(precision: 2)), landed at \(Double(landed), format: .fixed(precision: 2)), stands at \(Double(frame.minY - self.collection.contentOffset.y), format: .fixed(precision: 2))")
                }
            }
            if let id = folding, let index = dataSource.indexPath(for: id),
               let cell = collection.cellForItem(at: index) as? HostCell<ThinkingView> {
                folding = nil
                animate(cell.row, open: false, in: cell)
            }
            if !landed, fed == nil || rows.isEmpty, transcript?.loading == false { landed = true }
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
        // With no row in common there is nothing to work a difference out from.
        if previous.isDisjoint(with: ids) {
            dataSource.applySnapshotUsingReloadData(snapshot, completion: settle)
        } else {
            // Where the list stands once the rows are in is settled before any
            // row is built: rows joining in front otherwise leave the list at
            // its old offset, among rows nobody is to read, and build those.
            layout.stand = { [weak self] in
                guard let self else { return nil }
                if follow, !grew { return layout.foot }
                guard let anchor = anchor ?? pivot, let index = dataSource.indexPath(for: anchor.id),
                      let frame = layout.layoutAttributesForItem(at: index)?.frame else { return nil }
                return frame.minY + anchor.into
            }
            dataSource.apply(snapshot, animatingDifferences: false, completion: settle)
            layout.stand = nil
        }
        announce(built)
    }

    /// The rows the list holds this frame. Once the first screen is whole that
    /// is every row; until then it is a few more than last frame, from the row
    /// the reader is to stand at: down from a restored anchor, up from the tail.
    private func firstScreen(of all: [String]) -> [String] {
        guard let count = fed else { return all }
        // No rows yet (a page not read, an empty session): the notice stands alone.
        guard !rows.isEmpty else { return all }
        let view = visibleBox.height
        let pivot = pendingPosition.flatMap { $0.following ? nil : $0.anchor }.flatMap { all.firstIndex(of: $0) }
        let reach = pivot.map { all.count - $0 } ?? all.count
        func window(_ size: Int) -> [String] {
            pivot.map { Array(all[$0 ..< $0 + size]) } ?? Array(all.suffix(size))
        }
        // The view has no size to fill yet: `layoutSubviews` asks again.
        guard view > 0 else { return window(min(count, reach)) }
        if count >= reach || (count > 0 && collection.contentSize.height >= view) {
            fed = nil
            return all
        }
        dirty = true
        // Another pane's frame has had this turn of the main thread.
        guard Pace.taken < Self.budget else { return window(count) }
        let next = min(reach, count + 1)
        fed = next
        feeding = true
        return window(next)
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
        guard !following, let index = collection.indexPathsForVisibleItems.sorted().first(where: { dataSource.itemIdentifier(for: $0) != "notice:older" }),
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

    /// How far above the view's top the loaded rows must reach before the
    /// next older page is asked for, in view heights: a screen and a half
    /// (about 1,300 pt on a phone). A page takes a few hundred milliseconds
    /// and a hard flick covers about a screen in that time, so a steady
    /// scroll up meets rows, not the top; and the newest page, which is
    /// taller than that, does not ask for history nobody has scrolled toward.
    private static let reach = 1.5

    /// Asks for the next older page (`SessionsStore.readOlder`) when the
    /// reader is within `reach` of the first loaded rows, while the loaded
    /// rows are shorter than the view, or while a place to restore is not
    /// among them. Never for a pane nobody is looking at, and not while a
    /// page is on its way or the last one failed (its line asks again).
    private func askOlder() {
        guard let transcript, transcript.cursor != nil, !transcript.loading, !transcript.loadingOlder, transcript.olderFault == nil,
              fed == nil, taken >= blocks.count, inView, let sessions = hub?.sessions else { return }
        let above = collection.contentOffset.y + collection.adjustedContentInset.top
        let short = collection.contentSize.height < visibleBox.height
        let sought = pendingPosition.map { !$0.following && $0.anchor != nil } ?? false
        guard short || sought || above < Self.reach * collection.bounds.height else { return }
        sessions.readOlder(transcript.id)
    }

    /// The failed page's line asks for it again.
    public func collectionView(_: UICollectionView, didSelectItemAt index: IndexPath) {
        guard let id = dataSource.itemIdentifier(for: index), case .retry = items[id]?.kind, let transcript else { return }
        hub?.sessions.readOlder(transcript.id)
    }

    public func collectionView(_: UICollectionView, shouldSelectItemAt index: IndexPath) -> Bool {
        guard let id = dataSource.itemIdentifier(for: index), case .retry = items[id]?.kind else { return false }
        return true
    }

    private func restoreIfReady() {
        guard let position = pendingPosition, dataSource.snapshot().numberOfItems > 0 else { return }
        if position.following { pendingPosition = nil; latest(); return }
        guard let id = position.anchor, let index = dataSource.indexPath(for: id),
              let frame = collection.layoutAttributesForItem(at: index)?.frame else {
            // The place may be in history not read yet (`askOlder` reads toward
            // it); with none left to read, there is no such row to stand at.
            if let transcript, !transcript.loading, transcript.cursor == nil, taken >= blocks.count, fed == nil { pendingPosition = nil }
            return
        }
        // A first screen is built down from the anchor: it is kept until every row is in.
        if fed == nil { pendingPosition = nil }
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
