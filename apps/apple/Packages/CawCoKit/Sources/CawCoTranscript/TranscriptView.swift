import CawCoAPI
import CawCoCore
import CawCoDesign
import CawCoMascot
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
    /// A `show_preview` call's card was tapped: its input, what to show.
    public var onOpenPreview: ([String: Any]) -> Void = { _ in }
    /// "Back to the fleet", from the state an unreachable id shows.
    public var onReturnToFleet: () -> Void = {}
    /// Whether a queued message can be taken back and edited, and lifting
    /// it into the composer (a tap on its bubble).
    public var canEditQueued: (String) -> Bool = { _ in false }
    public var onEditQueued: (String) -> Void = { _ in }
    /// The queued message whose words are in the composer.
    private var liftedQueued: String?
    /// What queued messages were just replaced with, by id, until the hub's
    /// own record of each new send takes their place.
    private var replacements: [String: String] = [:]
    private let paneState = PaneState()

    private let collection: UICollectionView
    /// The rows going out of focus under the tab strip at the list's top edge (HeadFade.svelte).
    private let headFade: HeadFade
    private var dataSource: UICollectionViewDiffableDataSource<Int, String>!
    private let env = RowEnv()
    /// Every row's view, kept laid out for its item (RowStore).
    private lazy var store = RowStore(env: env)
    private var items: [String: Item] = [:]
    private var prints: [String: String] = [:]
    private var order: [String] = []
    private var open = Set<String>()
    private var transcript: SessionTranscript?

    // The hub's transcript, prepared off the main thread (TranscriptPrep) a
    // generation at a time; what the list draws is the last one applied.
    private var revision = -1
    private let prep = TranscriptPrep()
    /// A preparation is running; `wanted` is the input to run next.
    private var preparing = false
    private var wanted: TranscriptPrep.Input?
    /// The generation applied: its blocks, branches, queue and settled items.
    private var prepared: Prepared?
    private var blocks: [Block] = []
    private var branches: [String: Branch] = [:]
    private var queued: [Block] = []
    private var rowCount = 0
    private var voices = Voices()
    /// Caw's compaction mark is read ahead of the first compaction drawn.
    private static var markWarmed = false

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

    /// Whatever marks the list for drawing wakes the frame.
    private var dirty = true {
        didSet { if dirty { wake() } }
    }

    private var following = true
    private var landed = false
    /// How many rows of the first screen the list holds, until it holds every
    /// row. A screen of rows built and measured in one go held the main thread
    /// a quarter of a second, so a first screen is built a few rows a frame
    /// from where the reader is to stand, out of sight until it is whole, and
    /// the rest (rows off the screen, which cost nothing) joins it at once.
    private var fed: Int? = 0
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
    #if DEBUG
    private let probe = DisclosureProbe()
    #endif

    /// The list's layout, which is asked where the list stands when rows join it.
    private final class Layout: UICollectionViewCompositionalLayout {
        /// Where the list is to stand once an update's rows are in; nil leaves it.
        var stand: (() -> CGFloat?)?
        /// Where the list stands while a body opens or folds shut under the
        /// reader (`revealMoved`): whatever the list's own resizing proposes.
        var hold: CGFloat?

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
            guard let view = collectionView, let y = stand?() ?? hold, abs(view.contentOffset.y - y) > 0.5 else { return }
            view.contentOffset.y = y
        }

        override func targetContentOffset(forProposedContentOffset proposed: CGPoint) -> CGPoint {
            guard let y = stand?() ?? hold else { return super.targetContentOffset(forProposedContentOffset: proposed) }
            return CGPoint(x: proposed.x, y: y)
        }
    }

    private let layout: Layout

    private static var warmed = false

    /// What the transcript costs once an app's life, done off the main thread
    /// on the launch's own task (CawCoScreens `Launch`), before any session's
    /// list is built: the code grammars (`Highlight.warm`), and the list's
    /// cell types, one per row view (`makeDataSource`). The first registration
    /// of each asked the runtime to find its type by name and check its row
    /// view's conformance, scanning every image: 42 ms of the first session's
    /// mount on the main thread in a Release build. Both answers are cached for
    /// the process. Returns the types, so the caller holds each: a type read
    /// and dropped is not built.
    public nonisolated static func prepare() -> [ObjectIdentifier] {
        Highlight.warm()
        return [
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<PieceView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<UserTurnView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<ToolLineView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<ThinkingView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<SystemLineView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<PeerView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<QuestionCardView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<SubagentView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<DelegateView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<RunView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<LiveToolView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<NoticeView>, String>.self),
            ObjectIdentifier(UICollectionView.CellRegistration<HostCell<CompactionDividerView>, String>.self),
        ]
    }

    /// What the first row of the first transcript otherwise pays for under the
    /// reader, once an app's life: the text system (its classes, the faces,
    /// the Markdown parser), in a turn of the main thread of its own while the
    /// first page is still on its way. The code grammars are the launch's
    /// (`prepare`).
    private static func warm() {
        guard !warmed else { return }
        warmed = true
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
            // The list's foot (`bottom: space5`) is the collection's inset, not
            // a section's: the settled rows and the tail are two sections, one list.
            section.contentInsets = .init(top: 0, leading: narrow ? Space.space5 : Space.space7, bottom: 0,
                                          trailing: narrow ? Space.space5 : Space.space6)
            return section
        }
        self.layout = layout
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        headFade = HeadFade(collection)
        super.init(frame: frame)
        Self.warm()
        // The session pane's ground (SessionPane.svelte `.pane`): the recess, not the page.
        backgroundColor = Palette.surfaceRecess
        collection.backgroundColor = Palette.surfaceRecess
        collection.delegate = self
        collection.keyboardDismissMode = .interactive
        collection.selfSizingInvalidation = .enabledIncludingConstraints
        collection.contentInset.bottom = Space.space5
        collection.accessibilityLabel = "Session transcript"
        collection.translatesAutoresizingMaskIntoConstraints = false
        addSubview(collection)
        // Over the rows, under the docks (placeDock) and the pane's state: only rows pass under it.
        addSubview(headFade)
        NSLayoutConstraint.activate([
            collection.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor),
            collection.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor),
            collection.topAnchor.constraint(equalTo: topAnchor),
            collection.bottomAnchor.constraint(equalTo: bottomAnchor),
            // The list's visible top edge: its adjusted inset is the safe area's.
            headFade.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            headFade.leadingAnchor.constraint(equalTo: leadingAnchor),
            headFade.trailingAnchor.constraint(equalTo: trailingAnchor),
            headFade.heightAnchor.constraint(equalToConstant: HeadFade.height),
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
        // Only the type size: the words are set in faces at it. Light and dark
        // are not this view's: the rendered words carry the colour sets, which
        // resolve as they draw, and each row that paints a colour of its own
        // (a listing, a diff, a card's edge) paints it again itself. The system
        // flips the appearance whenever the app goes to the background, to
        // snapshot it both ways: clearing here threw every row of a long
        // session away and built them all again on each trip (a 412ms frame
        // over 936 rows).
        registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (view: TranscriptView, _: UITraitCollection) in
            // The words are set in faces at this type size: rendered again,
            // prepared again, every row drawn again.
            view.env.cache.clear()
            MarkdownCache.shared.clear()
            view.store.clear()
            view.prints = [:]
            view.listedStamp = nil
            Task { [prep = view.prep] in await prep.reset() }
            view.request()
            view.dirty = true
        }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) { fatalError("TranscriptView is built in code") }

    /// The width a row stands at: the list less its section's inset (the
    /// layout above); nil while the list has no width to give.
    private var rowWidth: CGFloat? {
        let width = Double(collection.bounds.width)
        let inset = width <= 900 ? 2 * Space.space5 : Space.space7 + Space.space6
        return width > inset ? CGFloat(width - inset) : nil
    }

    /// The view a row of `kind` is drawn in.
    private static func rowType(_ kind: Item.Kind) -> any RowContent.Type {
        switch kind {
        case .piece: PieceView.self
        case .user: UserTurnView.self
        case .tool: ToolLineView.self
        case .thinking: ThinkingView.self
        case .system, .harness: SystemLineView.self
        case .peer: PeerView.self
        case .question: QuestionCardView.self
        case .subagent: SubagentView.self
        case .delegate: DelegateView.self
        case .run: RunView.self
        case .compaction: CompactionDividerView.self
        case .livetool: LiveToolView.self
        case .notice, .retry, .empty: NoticeView.self
        }
    }

    private func makeDataSource() {
        func registration<V: RowContent>(_: V.Type) -> UICollectionView.CellRegistration<HostCell<V>, String> {
            UICollectionView.CellRegistration<HostCell<V>, String> { [weak self] cell, _, id in
                guard let self, let item = items[id] else { return }
                cell.host(item, store: store, width: rowWidth)
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

    private struct FileGone: LocalizedError {
        var errorDescription: String? { "The hub no longer has that file." }
    }

    /// A file a turn carried, fetched from the hub under its own name and
    /// offered in the share sheet (save to Files, open in another app).
    private func share(_ ref: String, name: String, from source: UIView) {
        guard let url = env.url(ref) else { return }
        Task { [weak self, weak source] in
            do {
                let (download, response) = try await URLSession.shared.download(from: url)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw FileGone() }
                let folder = FileManager.default.temporaryDirectory.appending(path: "cawco-files/\(UUID().uuidString)", directoryHint: .isDirectory)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appending(path: name.isEmpty ? "file" : (name as NSString).lastPathComponent)
                try FileManager.default.moveItem(at: download, to: file)
                guard let self, let source, let host = window?.rootViewController else { return }
                var top = host
                while let shown = top.presentedViewController { top = shown }
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = source
                sheet.popoverPresentationController?.sourceRect = source.bounds
                top.present(sheet, animated: true)
            } catch {
                Toast.error("Couldn't open \(name). \(error.localizedDescription)", in: self)
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
        env.openFile = { [weak self] ref, name, source in self?.share(ref, name: name, from: source) }
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
        env.openPreview = { [weak self] input in self?.onOpenPreview(input) }
        env.isTaken = { [weak self] id in self?.liftedQueued == id }
        env.replacement = { [weak self] id in self?.replacements[id] }
        env.canEditQueued = { [weak self] id in self?.canEditQueued(id) ?? false }
        env.editQueued = { [weak self] id in self?.onEditQueued(id) }
        env.readOlder = { [weak self] in
            guard let self, let id = transcript?.id else { return }
            hub?.sessions.readOlderPage(id)
        }
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
        Self.sleepers.remove(self)
        if window != nil {
            let target = DisplayTarget(self)
            proxy = target
            let link = CADisplayLink(target: target, selector: #selector(DisplayTarget.tick(_:)))
            link.add(to: .main, forMode: .common)
            self.link = link
            lastTick = 0
            lastBusy = CACurrentMediaTime()
            Pace.watch()
        } else {
            // Off the screen, every delegate card this view drew has left it.
            for cell in collection.visibleCells { (cell as? HostCell<DelegateView>)?.row?.untrack() }
            // Nobody watches the tail of a pane off the screen (arrivals.svelte.ts).
            arriving = [:]
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

    /// The first screen is whole and every block of history is in the list:
    /// what is left for a pane off screen is the session's own changes.
    private var caughtUp: Bool { landed && current }

    /// The generation applied is the transcript as it stands: nothing is
    /// being prepared, and nothing is waiting to be.
    private var current: Bool { prepared?.revision == revision && !preparing && wanted == nil }

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
        if current, let want = tray.reveal[id] {
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
        if settlingFoot {
            settlingFoot = false
            gliding = false
            drainSlack()
            place(scrollView)
        }
        guard let want = revealing else { return }
        revealing = nil
        gliding = false
        if let target = centred(want) { collection.contentOffset.y = target }
        place(scrollView)
        settled(want)
    }

    /// A drag let go in the blank room under the foot is gliding back to it.
    private var settlingFoot = false

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
            store.clear()
            prints = [:]
            listedStamp = nil
            dirty = true
        }
        // A first screen waiting on the view's size has it now.
        if fed != nil { dirty = true }
    }

    // MARK: Reading the transcript

    /// The session's preview opened, changed or closed: the preview cards on
    /// screen take their presence again (a card drawn later reads it then).
    public func previewChanged() {
        // A card on the screen takes it now; one kept off it, when it is next stood.
        for (id, row) in store.held(ToolLineView.self) {
            if row.window != nil { row.previewChanged() } else { store.stale(id) }
        }
    }

    public func configure(_ transcript: SessionTranscript) {
        // Read again only when the hub's facts changed: a transcript is handed
        // in on every frame of a streaming reply.
        if transcript.facts != self.transcript?.facts { facts = nil }
        self.transcript = transcript
        env.sessionId = transcript.id
        joinTray()
        env.machineId = transcript.location?.machineId
        var agent = env.agentName
        if let harness = transcript.facts?.harness ?? transcript.location?.harness {
            agent = ["claude": "Claude Code", "opencode": "opencode", "code": "opencode", "pi": "pi"][harness] ?? harness
        }
        // A revision of the hub's blocks is prepared off the main thread and
        // drawn when it is ready; until then the list draws the last one.
        if transcript.blockRevision != revision || agent != env.agentName {
            revision = transcript.blockRevision
            env.agentName = agent
            request()
        }
        // Read here so the screen hears of them: an older page on its way, one
        // that could not be read, and whether any is left (the strip before
        // the first row, and when the next page is asked for).
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

    // MARK: Preparing

    /// Asks for the transcript as it stands to be prepared (TranscriptPrep):
    /// at once when nothing is being prepared, else when that finishes. Only
    /// the newest ask runs; one in between is never prepared.
    private func request() {
        guard let transcript else { return }
        let streams = (try? JSONEncoder().encode(transcript.tail?.streams))
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] } ?? [:]
        wanted = TranscriptPrep.Input(revision: transcript.blockRevision, history: transcript.historyRevision,
                                      blocks: transcript.blocks, branches: transcript.branches, queued: transcript.queued,
                                      streams: streams, agentName: env.agentName, keys: keys)
        pump()
    }

    private func pump() {
        guard !preparing, let input = wanted else { return }
        wanted = nil
        preparing = true
        let interval = signposter.beginInterval("prepare")
        Task { [weak self, prep, signposter] in
            let result = await prep.prepare(input)
            signposter.endInterval("prepare", interval)
            guard let self else { return }
            preparing = false
            adopt(result)
            pump()
        }
    }

    /// One prepared generation becomes what the list draws from: its blocks,
    /// its rows' items, the floor the tail takes up. Applied in the next frame.
    private func adopt(_ next: Prepared) {
        prepared = next
        blocks = next.blocks
        branches = next.branches
        queued = next.queued
        rowCount = next.rowCount
        voices = next.voices
        settled = (stamp: "\(next.revision)|\(next.history)|\(keys.count)", items: next.items, rail: next.rail, fleet: next.fleet)
        // Keys given and a fold begun while this generation was being prepared hold on it.
        for (id, key) in keys where next.keys[id] == nil { rekey(id, as: key) }
        if let folding { foldShut(folding) }
        // A replaced message's stand-in words go with it.
        if !replacements.isEmpty {
            let held = Set(blocks.map(\.id) + queued.map(\.id))
            replacements = replacements.filter { held.contains($0.key) }
        }
        // Caw's file is read now, while his row is still being laid out (compaction-mark.ts `warmCompactionMark`).
        if next.compacts, !Self.markWarmed { Self.markWarmed = true; CawMark.warm(.compacted) }
        dirty = true
    }

    /// The settled rows' items as applied, what they were prepared from, and
    /// which of them read the fleet (`fleetPrint`). A landed answer's live key
    /// and a reasoning block folding shut are put on them here, between
    /// generations (`build`).
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
        // A streamed answer that landed as its message keeps the live row's
        // cells: its items take the live row's key now, and every preparation
        // after this one builds them under it.
        if liveWasOn, !liveOn, !lastAnswer.isEmpty,
           let landed = blocks.last(where: { $0.type == "assistant" }),
           landed.content.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix(lastAnswer.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)),
           keys[landed.id] == nil {
            let key = "live:\(generation)"
            keys[landed.id] = key
            rekey(landed.id, as: key)
            request()
        }
        // Reasoning the reader watched lands as its own row and folds shut there.
        if liveWasOn, reasoningEnded, !reasoning, let thought = blocks.last(where: { $0.type == "thinking" }), !known.contains(thought.id) {
            folding = thought.id
            foldShut(thought.id)
        }
        reasoningEnded = reasoning
        liveWasOn = liveOn
        lastAnswer = liveOn ? received : lastAnswer

        // The live tail's words are rendered here, on the frame's clock; the
        // settled rows come prepared.
        var builder = Builder(agentName: env.agentName, cache: env.cache)
        builder.keys = keys
        var out = settled?.items ?? []
        var rail = settled?.rail ?? false
        // Read once a build: a fleet row is a large value, and going through
        // them all for every report in a long session was most of a build.
        let sessions = (settled?.fleet.isEmpty ?? true) ? [] : (hub?.fleet.byId.keys).map(Array.init) ?? []
        for i in settled?.fleet ?? [] { out[i].print += fleetPrint(out[i], sessions: sessions) }
        settledCount = out.count

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
            // Whether each can be lifted into the composer: its note reads it. Its fold and
            // stand-in words are drawn into the cell directly (`foldQueued`), on their own clock.
            return built.items.map { item in
                var item = item
                item.print += "\(canEditQueued(item.id))"
                return item
            }
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

        // Why the page before the first row could not be read (Transcript.svelte `.older`).
        let fault = transcript.olderFault.map { fault in
            Item(id: Self.olderId, top: 0, kind: .retry("\(fault.reason == .offline ? "This machine is offline" : "The turns before these couldn't be read"): \(fault.message)"),
                 print: "failed\(fault.message)")
        }
        // The reader's place is at a row older than the rows held, with history
        // left to read: nothing is drawn until a page holds it.
        let sought = pendingPosition.flatMap { $0.following ? nil : $0.anchor }
        seeking = sought.map { anchor in !out.contains { $0.id == anchor } } ?? false
            && rowCount > 0 && transcript.cursor != nil && transcript.olderFault == nil && !transcript.loading
        older = transcript.cursor == nil ? "" : fault?.print ?? "loading"
        if out.isEmpty {
            // Empty is what is drawn: with a page before it, the transcript is still loading.
            let loading = transcript.loading || prepared == nil || transcript.cursor != nil
            out = [fault
                ?? (loading ? Item(id: "notice:loading", top: 0, kind: .notice("Loading transcript…"), print: "loading")
                    : Item(id: "notice:empty", top: 0, kind: .empty, print: "empty"))]
            settledCount = out.count
        } else if transcript.cursor != nil {
            // Before the first row, while there is a page before it: the
            // transcript's loading line, or why that page could not be read and
            // the way to ask again. The reader sees it only at the very top; a
            // page is asked for a view before that (`askOlder`).
            out.insert(fault ?? Item(id: Self.olderId, top: 0, kind: .notice("Loading transcript…"), print: "loading"), at: 0)
            settledCount += 1
        }
        return out
    }

    /// The strip before the first row (`build`): never a row the reader's place is kept by.
    private static let olderId = "notice:older"
    /// What the strip before the first row says: nothing (no page before
    /// it), loading, or why a page failed. Part of what the list's settled
    /// rows were built from (`settledStamp`).
    private var older = ""
    /// The place to restore is at a row older than the rows held, and the
    /// pages before them are being read until one holds it (Transcript.svelte
    /// "THE READER'S PLACE IS READ BACK TO"). A page that cannot be read ends
    /// the search: the list is drawn with what it holds, the failure at its top.
    private var seeking = false

    /// What the list's settled rows are built from: the prepared generation, and the strip before them.
    private var settledStamp: String? { settled.map { "\($0.stamp)|\(older)" } }

    /// A landed answer's settled items take the live row's key (rows.ts
    /// `keepLive`): the cells that drew it streaming go on drawing it.
    private func rekey(_ id: String, as key: String) {
        guard var current = settled else { return }
        for i in current.items.indices.reversed() where current.items[i].id.hasPrefix("\(id):") {
            let item = current.items[i]
            current.items[i] = Item(id: key + item.id.dropFirst(id.count), top: item.top, kind: item.kind, print: item.print)
        }
        current.stamp += "|\(key)"
        settled = current
    }

    /// The reasoning block `id`, settled, arrives open and folds shut.
    private func foldShut(_ id: String) {
        guard var current = settled else { return }
        for i in current.items.indices.reversed() {
            guard case let .thinking(r) = current.items[i].kind, r.key == "think:\(id)" else { continue }
            let item = current.items[i]
            current.items[i] = Item(id: item.id, top: item.top, kind: .thinking(.init(key: r.key, text: r.text, live: false, folding: true)),
                                    print: item.print + "folding")
            break
        }
        current.stamp += "|fold:\(id)"
        settled = current
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
    /// How many of the items built lead with the settled rows; the rest are the tail.
    private var settledCount = 0
    /// The rows the list holds, as last given to it: its settled section and its tail's.
    private var listed: (settled: [String], tail: [String]) = ([], [])
    /// What the list's settled rows were built from (`settled.stamp`), once
    /// it holds every one of them; nil while a first screen is still filling.
    private var listedStamp: String?
    /// This frame changed what the list draws, so it is laid out within it.
    private var drewThisFrame = false

    // MARK: The frame

    fileprivate func frame(_ link: CADisplayLink) {
        let now = CACurrentMediaTime()
        let dt = lastTick == 0 ? link.targetTimestamp - link.timestamp : min(0.1, now - lastTick)
        lastTick = now
        let offsetBefore = collection.contentOffset
        let sizeBefore = collection.contentSize
        let streaming = cursor < characters.count
        var committed = false
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
        // A pane beside the one being read catches up where it stands, its
        // first screen and then its history a stretch a frame, so the swipe
        // that brings it into view finds it whole. Never in a frame a pager
        // moves in: that frame is the swipe's, and the pane holds what it has.
        // Caught up, it keeps what it has until it comes on screen: a long
        // session's every change is a frame's worth of work, and it was taken
        // out of the reply the reader was watching stream. What it owes is
        // drawn before the first frame it shows in (`drawOwed`).
        let inSight = inView
        let yielding = !inSight && PagingScrollView.anyPaging
        if dirty {
            if inSight || (!caughtUp && !yielding && Pace.taken < Self.budget / 2) {
                dirty = false
                commit()
                committed = true
            } else if caughtUp || yielding {
                Self.owing.add(self)
                Self.watchOwing()
            }
        }
        // A first screen takes a row at a time for as long as the frame has
        // time for one: rows cost anything from a millisecond to a frame's worth.
        while feeding, !yielding, CACurrentMediaTime() - now < Self.budget / 2 {
            collection.layoutIfNeeded()
            commit(fresh: false)
            committed = true
        }
        restoreIfReady()
        stepReveals(now)
        drainSlack()
        // The tail is not held under the reader's finger, nor while the list
        // coasts: a slow drag moves less in a frame than the distance that lets
        // go of the tail, and pinning it each frame would never let it leave.
        if following, !gliding, !collection.isDragging, !collection.isDecelerating { latest() }
        let visible = collection.visibleCells
        // A pane beside the one being read is laid out but never painted: what
        // draws itself once (Caw on a divider) draws when the pane comes on screen.
        let shown = onScreen
        if shown, !wasOnScreen {
            for cell in visible { (cell as? HostCell<CompactionDividerView>)?.row?.cameOnScreen() }
        }
        wasOnScreen = shown
        let seen = collection.convert(visibleBox, to: nil)
        for cell in visible {
            (cell as? HostCell<PieceView>)?.row?.fade(now)
            (cell as? HostCell<ThinkingView>)?.row?.fade(now)
            (cell as? HostCell<DelegateView>)?.row?.track(in: seen)
        }
        honourTray()
        updateDock()
        // The rows this frame asked for are built inside it, so its cost is
        // whole. A frame that drew nothing lays nothing out.
        if drewThisFrame {
            drewThisFrame = false
            collection.layoutIfNeeded()
        }
        askOlder()
        let warming = inSight && warm(since: now, frame: link.targetTimestamp - link.timestamp)
        #if DEBUG
        probe.sample(collection) { id in self.dataSource.indexPath(for: id).flatMap { self.collection.cellForItem(at: $0) } }
        #endif
        let took = CACurrentMediaTime() - now
        Pace.spent(took, in: env.sessionId, items: items.count, cells: collection.visibleCells.count)
        // Work this frame, or work the next one has: the frame runs on. A dirty
        // pane that owes its drawing (`owing`) waits for the screen, not the frame.
        let busy = committed || streaming || feeding || gliding || revealing != nil || !moving.isEmpty
            || (dirty && (yielding || !Self.owing.contains(self)))
            || collection.isDragging || collection.isDecelerating || collection.isTracking
            || collection.contentOffset != offsetBefore || collection.contentSize != sizeBefore
            || warming || DelegateTrayState.shared.reveal[env.sessionId] != nil
        if busy {
            lastBusy = now
        } else if now - lastBusy > Self.linger {
            sleep()
        }
    }

    // MARK: Sleeping

    /// When the frame last had work.
    private var lastBusy = 0.0
    /// How long the frame runs on after its last work: a streamed stretch fades
    /// in over `durMenu` after the frame that drew it (ProseView `fade`).
    private static let linger = 0.5
    /// What the frame read as it slept: a turn of the main thread that changes
    /// any of it wakes the frame.
    private var slept: SleepMark?

    private struct SleepMark: Equatable {
        var box: CGRect
        var inView: Bool
        var offset: CGPoint
        var size: CGSize
        var news: DelegateTrayState.News?
        var reveal: String?
    }

    private var sleepMark: SleepMark {
        let tray = DelegateTrayState.shared
        return SleepMark(box: convert(bounds, to: nil), inView: inView, offset: collection.contentOffset, size: collection.contentSize,
                         news: tray.news[env.sessionId], reveal: tray.reveal[env.sessionId])
    }

    /// Panes whose frame is paused.
    private static let sleepers = NSHashTable<TranscriptView>.weakObjects()
    private static var watchingSleepers = false

    /// Nothing for the frame to do: the display link pauses, and the pane is
    /// watched at the end of every turn the main thread takes anyway.
    private func sleep() {
        guard let link, !link.isPaused else { return }
        link.isPaused = true
        slept = sleepMark
        Self.sleepers.add(self)
        Self.watchSleepers()
    }

    /// The frame runs again from the next display frame.
    private func wake() {
        lastBusy = CACurrentMediaTime()
        guard let link, link.isPaused else { return }
        link.isPaused = false
        slept = nil
        Self.sleepers.remove(self)
    }

    /// Ends every turn of the main thread by waking each sleeping pane whose
    /// place on the screen, list, or tray asks changed in it: a swipe or a tab
    /// bringing it into view, a row sizing itself, the tray asking for a report.
    private static func watchSleepers() {
        guard !watchingSleepers else { return }
        watchingSleepers = true
        let activities = CFRunLoopActivity([.beforeWaiting, .exit]).rawValue
        let observer = CFRunLoopObserverCreateWithHandler(nil, activities, true, 1_998_000) { _, _ in
            MainActor.assumeIsolated {
                for view in sleepers.allObjects where view.slept != view.sleepMark {
                    view.wake()
                }
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
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
                && transcript.cursor == nil && queued.isEmpty && hub != nil && hub?.fleet.byId[transcript.id] == nil
            let named: PaneState.State? = transcript.fault.map { .fault($0) }
                ?? (transcript.missing ? .missing(transcript.id) : blank ? .blank : nil)
            if let named { paneState.show(named) }
            paneState.isHidden = named == nil
            collection.isHidden = named != nil
        }
        // The settled rows and the tail are sections of their own: what the
        // tail does is laid out in the tail's section, and the history above
        // it is not solved again for a streamed word.
        let tailStart = min(settledCount, built.count)
        let before = listed
        // The settled rows are the ones the list already holds, as they were
        // built (a frame of a streamed reply): only the tail, and the rows that
        // read the fleet, are looked at. A long session's history is not
        // walked again for every frame of its tail.
        let quiet = fresh && fed == nil && listedStamp != nil && listedStamp == settledStamp
            && before.settled.count == tailStart
        // The prepared rows stand after the strip before the first row, when it is drawn.
        let lead = built.first?.id == Self.olderId ? 1 : 0
        let previous = items
        let section: (settled: [String], tail: [String])
        var changed: [String] = []
        /// The items this frame drew from that the list may not have yet.
        let looked: [Item]
        if quiet {
            let tail = Array(built[tailStart...])
            let tailIds = tail.map(\.id)
            for id in before.tail where !tailIds.contains(id) {
                items[id] = nil
                prints[id] = nil
            }
            var touched = tail
            for i in settled?.fleet ?? [] where i + lead < tailStart { touched.append(built[i + lead]) }
            for item in touched {
                if prints[item.id] != item.print, dataSource.indexPath(for: item.id) != nil { changed.append(item.id) }
                items[item.id] = item
                prints[item.id] = item.print
            }
            section = (before.settled, tailIds)
            looked = touched
        } else {
            var next: [String: Item] = [:]
            for item in built { next[item.id] = item }
            let all = built.map(\.id)
            let ids = firstScreen(of: all)
            let tailIds = Set(all[tailStart...])
            section = (ids.filter { !tailIds.contains($0) }, ids.filter { tailIds.contains($0) })
            for item in built where prints[item.id] != item.print {
                if dataSource.indexPath(for: item.id) != nil { changed.append(item.id) }
            }
            items = next
            prints = Dictionary(uniqueKeysWithValues: built.map { ($0.id, $0.print) })
            looked = built
        }
        listedStamp = fed == nil ? settledStamp : nil
        collection.alpha = fed == nil || rowCount == 0 ? 1 : 0
        if !quiet { store.keep(items.keys) }
        // A row is drawn arriving (Row.svelte; arrivals.svelte.ts, THE ARRIVAL
        // RULE) only when it is a live arrival the reader watches: new to this
        // view, brought by the live stream rather than a read of history (the
        // first page, an older page, a read again), joining after every row
        // the list held, while the reader stands at the tail. Older history
        // joining in front, and a row scrolled back to, draw still: a row of
        // history given a ticket stood blank wherever the reader first
        // scrolled to it, then faded in.
        let history = prepared?.history ?? 0
        let live = history == readHistory
        readHistory = history
        if env.watched, live, following {
            let order = quiet ? section.tail : section.settled + section.tail
            let held = quiet ? Set(before.tail) : Set(before.settled).union(before.tail)
            if quiet || !held.isEmpty {
                let after = (order.lastIndex { held.contains($0) } ?? -1) + 1
                let now = CACurrentMediaTime()
                for (slot, id) in order[after...].filter({ !known.contains($0) }).enumerated() {
                    arriving[id] = now + Double(min(slot, 3)) * Motion.durStagger
                }
            }
        }
        known.formUnion(quiet ? section.tail : looked.map(\.id))
        if section.settled == before.settled, section.tail == before.tail {
            guard !changed.isEmpty else { return }
            // The same rows, some drawn anew (the streamed reply, mostly): each
            // on screen is configured where it stands and sizes itself, and the
            // list takes no update. One off the screen is reconfigured below.
            var unseen: [String] = []
            for id in changed {
                if let index = dataSource.indexPath(for: id), let item = items[id],
                   let cell = collection.cellForItem(at: index) as? ItemCell {
                    // A row whose body is moving is sized by the body's steps, not the list's own resizing.
                    if moving.contains(where: { Self.cell(of: $0) === cell }) {
                        quietly { cell.redraw(item) }
                    } else {
                        cell.redraw(item)
                    }
                } else {
                    unseen.append(id)
                }
            }
            drewThisFrame = true
            if unseen.isEmpty {
                collection.layoutIfNeeded()
                if following, !gliding, !collection.isDragging, !collection.isDecelerating { latest() }
                announce(looked)
                return
            }
            changed = unseen
        }
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0, 1])
        snapshot.appendItems(section.settled, toSection: 0)
        snapshot.appendItems(section.tail, toSection: 1)
        snapshot.reconfigureItems(changed)
        listed = section
        drewThisFrame = true
        let follow = following
        // A row or a few arriving live glide the list down to them. A catch-up
        // (history read, or the backlog a reconnect delivers in one go) lands
        // at the new foot in one step: gliding through it scrolled the reader
        // through everything they missed.
        let added = section.settled.count + section.tail.count - before.settled.count - before.tail.count
        let grew = env.watched && live && (1 ... Self.glidesUpTo).contains(added) && follow && !UIAccessibility.isReduceMotionEnabled
        // With no row in common there is nothing to work a difference out from.
        let disjoint = quiet ? before.settled.isEmpty && Set(before.tail).isDisjoint(with: section.tail)
            : Set(before.settled).union(before.tail).isDisjoint(with: section.settled + section.tail)
        let from = collection.contentOffset
        // Rows shifted in front (older history) never move the reader: the
        // first row of the conversation on screen keeps its place (Transcript
        // `frontOnly`, `restore`). Not the strip before the first row: it
        // stands at the top whatever joins under it. A row's margin above it is
        // part of its cell and changes when the rows that join in front take it
        // into their group (a page that ended inside a run of calls): what is
        // kept in place is what the reader reads, so the change goes with it.
        let anchor: (id: String, into: CGFloat)? = follow || !landed ? nil : collection.indexPathsForVisibleItems.sorted().lazy.compactMap { index in
            guard let id = self.dataSource.itemIdentifier(for: index), id != Self.olderId,
                  let frame = self.collection.layoutAttributesForItem(at: index)?.frame else { return nil }
            let margin = CGFloat((self.items[id]?.top ?? 0) - (previous[id]?.top ?? 0))
            return (id, self.collection.contentOffset.y - frame.minY + margin)
        }.first
        // A first screen built down from a restored anchor stands at it.
        var pivot: (id: String, into: CGFloat)?
        if let position = pendingPosition, !position.following, let id = position.anchor {
            pivot = (id, CGFloat(position.offset))
        }
        let settle = { [weak self] in
            guard let self else { return }
            collection.layoutIfNeeded()
            if let anchor, let index = dataSource.indexPath(for: anchor.id),
               let frame = collection.layoutAttributesForItem(at: index)?.frame,
               abs(collection.contentOffset.y - (frame.minY + anchor.into)) > 0.5 {
                collection.contentOffset.y = frame.minY + anchor.into
            }
            // A body moving under the reader holds the place the update stood the list at.
            if layout.hold != nil { layout.hold = collection.contentOffset.y }
            if let id = folding, let index = dataSource.indexPath(for: id),
               let cell = collection.cellForItem(at: index) as? HostCell<ThinkingView>, let row = cell.row {
                folding = nil
                animate(row, open: false)
            }
            if !landed, fed == nil || rowCount == 0, transcript?.loading == false, prepared != nil { landed = true }
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
        if disjoint {
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
        announce(looked)
    }

    /// The rows the list holds this frame. Once the first screen is whole that
    /// is every row; until then it is a few more than last frame, from the row
    /// the reader is to stand at: down from a restored anchor, up from the tail.
    private func firstScreen(of all: [String]) -> [String] {
        guard let count = fed else { return all }
        // No rows yet (a page not read, an empty session): the notice stands alone.
        guard rowCount > 0 else { return all }
        // The place to restore is in a page not read yet: nothing is built until one holds it.
        guard !seeking else { return [] }
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
        if !reduced { (cell as? HostCell<CompactionDividerView>)?.row?.arrive(after: delay) }
    }

    public func collectionView(_: UICollectionView, didEndDisplaying cell: UICollectionViewCell, forItemAt _: IndexPath) {
        cell.contentView.layer.removeAllAnimations()
        cell.contentView.alpha = 1
        cell.contentView.transform = .identity
        // A delegate's card off the screen is the card leaving (tray.svelte.ts `trayCard`).
        (cell as? HostCell<DelegateView>)?.row?.untrack()
    }

    /// The reader's own scroll: they are not watching the tail, and every
    /// arrival still waiting to be drawn draws still (arrivals.svelte.ts).
    public func scrollViewWillBeginDragging(_: UIScrollView) {
        arriving = [:]
        // A body still moving goes on moving; the list is the reader's.
        layout.hold = nil
    }

    /// A drag let go past the rows' foot, in the blank room a fold left
    /// (`slack`), comes to rest at the foot rather than in the blank.
    public func scrollViewWillEndDragging(_: UIScrollView, withVelocity _: CGPoint, targetContentOffset target: UnsafeMutablePointer<CGPoint>) {
        guard slack > 0 else { return }
        target.pointee.y = min(target.pointee.y, realFoot)
    }

    public func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        guard !decelerate, slack > 0, scrollView.contentOffset.y > realFoot + 0.5 else { return }
        gliding = true
        settlingFoot = true
        scrollView.setContentOffset(CGPoint(x: 0, y: realFoot), animated: true)
    }

    // MARK: Rows before they are on the screen

    /// The history read (SessionTranscript `historyRevision`) the last commit drew from.
    private var readHistory = -1
    /// The most rows a live arrival glides the list down to.
    private static let glidesUpTo = 3
    /// Where the list stood at the last frame, for the way it is moving.
    private var lastOffset: CGFloat = 0
    /// Rows either side of the screen kept built.
    private static let reach = 16
    /// What a frame gives to building rows before they are on the screen, at most.
    private static let warmBudget = 0.004

    /// Builds the rows just past either edge of the screen (RowStore `warm`)
    /// with what the frame has left: the way the list is moving first, the
    /// nearest first. A row then enters the screen built, measured and laid
    /// out, and the frame it enters in only shows it. A frame that has
    /// already taken its share builds nothing. Says whether rows were left
    /// unvisited when the frame's share ran out: the next frame has them.
    private func warm(since start: Double, frame: Double) -> Bool {
        let offset = collection.contentOffset.y
        let up = offset < lastOffset - 0.5
        let down = offset > lastOffset + 0.5
        lastOffset = offset
        guard landed, fed == nil, !collection.isHidden, let width = rowWidth else { return false }
        let budget = min(Self.warmBudget, frame * 0.4)
        guard CACurrentMediaTime() - start < budget else { return false }
        let ids = listed.settled
        let shown = collection.indexPathsForVisibleItems.filter { $0.section == 0 }.map(\.item)
        guard let first = shown.min(), let last = shown.max(), last < ids.count else { return false }
        let above = Array(stride(from: first - 1, through: max(0, first - Self.reach), by: -1))
        let below = Array(stride(from: last + 1, to: min(ids.count, last + 1 + Self.reach), by: 1))
        let order = up ? above + below : down ? below + above
            : (0 ..< max(above.count, below.count)).flatMap { i in
                (i < above.count ? [above[i]] : []) + (i < below.count ? [below[i]] : [])
            }
        for index in order {
            guard CACurrentMediaTime() - start < budget else { return true }
            guard let item = items[ids[index]] else { continue }
            store.warm(Self.rowType(item.kind), item: item, width: width)
        }
        return false
    }

    // MARK: A queued message in the composer

    /// Folds the queued message `id` down to its tag while its words are in
    /// the composer, or unfolds it, showing `replacement` when it was
    /// replaced, on the drawer curve, so nothing below it jumps.
    public func foldQueued(_ id: String, folded: Bool, replacement: String?) {
        if folded { liftedQueued = id } else if liftedQueued == id { liftedQueued = nil }
        if let replacement { replacements[id] = replacement }
        guard let index = dataSource.indexPath(for: id), let item = items[id],
              let cell = collection.cellForItem(at: index) as? HostCell<UserTurnView> else {
            store.stale(id)
            dirty = true
            return
        }
        let change: @MainActor () -> Void = {
            cell.redraw(item)
            cell.contentView.layoutIfNeeded()
            cell.invalidateIntrinsicContentSize()
            self.collection.layoutIfNeeded()
        }
        guard !UIAccessibility.isReduceMotionEnabled, window != nil else {
            change()
            return
        }
        Motion.easeDrawer.animator(Motion.durPanel, animations: change).startAnimation()
    }

    /// The replaced words did not go in after all: the message shows its own again.
    public func dropReplacement(_ id: String) {
        guard replacements.removeValue(forKey: id) != nil else { return }
        if let index = dataSource.indexPath(for: id), let item = items[id],
           let cell = collection.cellForItem(at: index) as? HostCell<UserTurnView> {
            cell.redraw(item)
        } else {
            store.stale(id)
        }
        dirty = true
    }

    /// The view the queued message's words are drawn in, while it is in the list's view.
    public func queuedWords(_ id: String) -> UIView? {
        guard let index = dataSource.indexPath(for: id), let cell = collection.cellForItem(at: index) as? HostCell<UserTurnView>,
              let row = cell.row else { return nil }
        let box = row.wordsView.convert(row.wordsView.bounds, to: collection)
        return box.intersects(visibleBox) ? row.wordsView : nil
    }

    public func flashQueued(_ id: String) {
        guard let index = dataSource.indexPath(for: id), let cell = collection.cellForItem(at: index) as? HostCell<UserTurnView> else { return }
        cell.row?.flash()
    }

    // MARK: Disclosure

    private func toggle(_ key: String, from view: UIView) {
        guard let row = view as? Disclosing else { return }
        if open.contains(key) { open.remove(key) } else { open.insert(key) }
        readerToggled()
        animate(row, open: !row.disclosed)
        dirty = true
    }

    /// A body grows open (--dur-reveal) or folds shut (--dur-exit) on
    /// --ease-out: its height and its row's are stepped together a frame at a
    /// time (Reveal, `stepReveals`); what fades with it fades on the same
    /// curve and clock. At once under Reduce Motion.
    private func animate(_ row: Disclosing, open: Bool) {
        #if DEBUG
        if let cell = Self.cell(of: row), let index = collection.indexPath(for: cell), let id = dataSource.itemIdentifier(for: index) {
            probe.begin(collection, row: id, open: open, ids: dataSource.snapshot().itemIdentifiers) { id in
                self.dataSource.indexPath(for: id).flatMap { self.collection.cellForItem(at: $0) }
            }
        }
        #endif
        // Main-actor closures from a main-actor view, run on the main actor by the animator.
        nonisolated(unsafe) let (fade, shown) = row.toggled(open: open)
        // The body's elements joined or left the row: VoiceOver reads the
        // row's elements again (until told, it kept the closed row's).
        let done: @MainActor () -> Void = {
            shown()
            UIAccessibility.post(notification: .layoutChanged, argument: nil)
        }
        guard !UIAccessibility.isReduceMotionEnabled, window != nil else {
            fade(); done(); return
        }
        let animator = Motion.easeOut.animator(open ? Motion.durReveal : Motion.durExit) { fade() }
        animator.addCompletion { _ in done() }
        animator.startAnimation()
    }

    /// The bodies opening or folding shut, stepped each frame until they arrive.
    private var moving: [Reveal] = []

    /// Blank room held under the list's foot, past its last row. A body
    /// folding shut near the foot leaves less list below the reader than the
    /// screen shows: rather than the list coming down to meet its shorter foot
    /// (every row above the fold moving), the reader's place stays and the
    /// room past the foot stands blank until they scroll or rows arrive into
    /// it (`drainSlack`).
    private var slack: CGFloat = 0 {
        didSet { if slack != oldValue { collection.contentInset.bottom = Space.space5 + slack } }
    }

    /// The foot the list's rows reach, without the blank room (`bottomOffset` less `slack`).
    private var realFoot: CGFloat {
        let inset = collection.adjustedContentInset
        return max(-inset.top, collection.contentSize.height - collection.bounds.height + inset.bottom - slack)
    }

    /// The blank room is let go of as soon as the reader's place no longer
    /// needs it: they scrolled up, or rows arrived under the foot. It is never
    /// grown here, so it never moves the list.
    private func drainSlack() {
        guard slack > 0, moving.isEmpty else { return }
        let need = max(0, collection.contentOffset.y - realFoot)
        if need < slack - 0.5 { slack = need < 0.5 ? 0 : need }
    }

    /// Steps every moving body to where its curve is at `now` and lays each
    /// one's row out again at that height, in this same frame and without
    /// animation, so the row's foot and the rows under it are where the body's
    /// edge is. While the list does not follow the tail, it stands where it
    /// stood (`layout.hold`).
    ///
    /// The row's new height goes to the layout as a row measured while
    /// scrolling does (`resize`), and the layout pass that follows places
    /// every row on the screen and takes away the ones pushed off it. Not
    /// through the list's own resizing (`invalidateIntrinsicContentSize`),
    /// which is an update of its own ("coalesced … into a single update
    /// performed at the optimal time", "resized with animation" by default,
    /// WWDC22 "What's new in UIKit"): run on its own clock, the rows around the
    /// body jumped; run each frame, a row it pushed past the screen's foot was
    /// left standing where it last was, until the reader scrolled.
    private func stepReveals(_ now: CFTimeInterval) {
        guard !moving.isEmpty else { return }
        quietly {
            moving = moving.filter { reveal in
                let still = reveal.advance(now)
                if let cell = Self.cell(of: reveal) {
                    resize(cell)
                } else {
                    // Off the screen: measured again when a cell next stands it.
                    store.forget(holding: reveal)
                }
                return still
            }
            collection.layoutIfNeeded()
            if let held = layout.hold, abs(collection.contentOffset.y - held) > 0.5 { collection.contentOffset.y = held }
        }
        if moving.isEmpty { layout.hold = nil }
    }

    /// The layout takes `cell`'s height as it stands now, the way it takes a
    /// row's measured height as the row comes on the screen: the cell's fitted
    /// attributes, and the layout's own invalidation for them.
    private func resize(_ cell: ItemCell) {
        guard let index = collection.indexPath(for: cell), let original = layout.layoutAttributesForItem(at: index),
              let asked = original.copy() as? UICollectionViewLayoutAttributes else { return }
        let fitted = cell.remeasure(asked)
        guard layout.shouldInvalidateLayout(forPreferredLayoutAttributes: fitted, withOriginalAttributes: original) else { return }
        layout.invalidateLayout(with: layout.invalidationContext(forPreferredLayoutAttributes: fitted, withOriginalAttributes: original))
    }

    /// Runs `change` with the list's own resizing off and nothing animated: a
    /// moving body's row is sized by its steps alone (`stepReveals`), and a
    /// constraint changing in it asks the list for nothing.
    func quietly(_ change: () -> Void) {
        let mode = collection.selfSizingInvalidation
        collection.selfSizingInvalidation = .disabled
        UIView.performWithoutAnimation(change)
        collection.selfSizingInvalidation = mode
    }

    /// The list's cell `view` stands in.
    private static func cell(of view: UIView) -> ItemCell? {
        sequence(first: view, next: { $0.superview }).dropFirst().lazy.compactMap { $0 as? ItemCell }.first
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
        // At the tail, the foot is the rows' own.
        slack = 0
        layout.hold = nil
        scrollToBottom()
    }

    /// Jump to latest (Transcript `jump`): within three screens one smooth
    /// glide, past it — or under Reduce Motion — an instant landing.
    private func jump() {
        // The reader leaves a restored place for the tail.
        pendingPosition = nil
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

    // MARK: Older pages

    /// OLDER PAGES COME AS THE READER NEARS THEM, ONE AT A TIME
    /// (Transcript.svelte `askOlder`). The view holds the newest page and
    /// whatever its reader has scrolled up to. The next older page is asked
    /// for when less than one view of rows stands between the top of the view
    /// and the first row held (points for the web's pixels). A list shorter
    /// than its view is inside that distance by definition, so it fills, a
    /// page at a time, until it can scroll or the conversation's start is in
    /// hand; an empty newest page with a page before it reads that page.
    /// While the place to restore is in a page not read yet (`seeking`), the
    /// pages are read back to it whatever the distance.
    ///
    /// Never for a pane nobody is looking at, not while a page is on its way
    /// or the newest is being read, not again for a page that failed (its
    /// strip's Try again asks), and not until the page that last landed is in
    /// the list: asked between its landing and its rows, the reader would
    /// still seem to stand at the top and the next page would be read unasked.
    private func askOlder() {
        guard let transcript, let sessions = hub?.sessions, transcript.cursor != nil, !transcript.loading,
              !transcript.loadingOlder, transcript.olderFault == nil,
              transcript.blockRevision == revision, current, !dirty, inView else { return }
        if !seeking {
            guard landed, fed == nil || rowCount == 0 else { return }
            // From the first row of the conversation: the strip before it is not a row.
            let strip = dataSource.indexPath(for: Self.olderId).flatMap { collection.layoutAttributesForItem(at: $0)?.frame.maxY } ?? 0
            let above = collection.contentOffset.y + collection.adjustedContentInset.top - strip
            guard above < visibleBox.height else { return }
        }
        sessions.readOlderPage(transcript.id)
    }

    public var restorationPosition: TranscriptPosition {
        if let pendingPosition { return pendingPosition }
        guard !following, let index = collection.indexPathsForVisibleItems.sorted().first(where: { dataSource.itemIdentifier(for: $0) != Self.olderId }),
              let id = dataSource.itemIdentifier(for: index),
              let frame = collection.layoutAttributesForItem(at: index)?.frame else {
            return TranscriptPosition(following: following, anchor: nil, offset: 0)
        }
        return TranscriptPosition(following: false, anchor: id, offset: collection.contentOffset.y - frame.minY)
    }

    public func restorePosition(_ position: TranscriptPosition) {
        Self.restoring.notice("place to restore: following \(position.following), anchor \(position.anchor ?? "none", privacy: .public) +\(position.offset, format: .fixed(precision: 1))")
        following = position.following
        pendingPosition = position
        restoreIfReady()
    }

    private static let restoring = Logger(subsystem: "dev.cawco.app", category: "Restore")

    /// The restored place is held, every frame, until the reader moves the
    /// list: the rows above it are measured as they are built, and an offset
    /// set once from their estimated heights drifted tens of rows away from
    /// the anchor as their real heights came in.
    private func restoreIfReady() {
        guard let position = pendingPosition, dataSource.snapshot().numberOfItems > 0 else { return }
        if position.following { pendingPosition = nil; latest(); return }
        guard let id = position.anchor, let index = dataSource.indexPath(for: id),
              let frame = collection.layoutAttributesForItem(at: index)?.frame else { return }
        let y = frame.minY + position.offset
        if fed == nil, !placeHeld {
            placeHeld = true
            Self.restoring.notice("place restored at \(id, privacy: .public), offset \(Double(y), format: .fixed(precision: 1))")
        }
        guard abs(collection.contentOffset.y - y) > 0.5 else { return }
        collection.setContentOffset(CGPoint(x: 0, y: y), animated: false)
    }

    /// The restored place has stood once with every row in (logged once).
    private var placeHeld = false

    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView.isDragging || scrollView.isDecelerating else { return }
        pendingPosition = nil
        gliding = false
        revealing = nil
        drainSlack()
        place(scrollView)
    }

    /// Where the reader stands against the tail: following it, or far enough
    /// from it for "Jump to latest".
    private func place(_ scrollView: UIScrollView) {
        // From the tail as the reader can reach it: past the inset the composer
        // stands in, short of any blank room a fold left (`slack`). Standing in
        // that room is not following: the tail would pull the list down out of it.
        let distance = scrollView.contentSize.height + scrollView.adjustedContentInset.bottom - slack - scrollView.contentOffset.y - scrollView.bounds.height
        following = slack == 0 && distance <= Space.space8
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
        let rowsDrawn = rowCount > 0
        latestButton.show(landed && farFromLatest && rowsDrawn)
        catchUp.show((transcript?.loading == true || seeking) && rowsDrawn)
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

extension TranscriptView: RevealDriver {
    func readerToggled() {
        // The reader is acting where they stand: a restored place is theirs now.
        pendingPosition = nil
        // A disclosure the reader opens holds its header where they pressed it
        // and opens downward (Transcript `onrevealstart`); one they fold shut
        // holds it too, and the rows above it never move: either way the
        // transcript lets go of the tail.
        following = false
    }

    func revealMoved(_ reveal: Reveal) {
        if !moving.contains(where: { $0 === reveal }) { moving.append(reveal) }
        // Following the tail, the foot stays pinned and the rows above make the
        // room (a reasoning block folding shut is the transcript's own motion).
        // Otherwise the list stands where it is, with room under its foot for
        // all the fold can take away, so it never has to come down to meet it.
        if !following {
            let at = layout.hold ?? collection.contentOffset.y
            layout.hold = at
            if !reveal.isOpen, let from = reveal.travel {
                let inset = collection.adjustedContentInset
                let shortest = max(-inset.top, collection.contentSize.height - from - collection.bounds.height + inset.bottom - slack)
                slack = max(slack, at - shortest)
            }
        }
        // The first step is this frame's (and, under Reduce Motion, the last);
        // the frame runs on for the rest, a sleeping one woken for them.
        stepReveals(CACurrentMediaTime())
        wake()
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
