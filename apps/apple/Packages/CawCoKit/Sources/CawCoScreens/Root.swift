public import UIKit
import CawCoCore
import CawCoDesign
import CawCoMascot
import OSLog

/// One window's interface: Connect until a hub is known and read, then the
/// board. The first read of the fleet is a real wait, so Caw stands in for
/// it once it outlasts the grace; from then on a drop keeps the board,
/// greyed, under its status line, as the web does.
public final class RootViewController: ObservedViewController {
    private let hub = HubConnection()
    private lazy var home = HomeModel(hub: hub)
    private lazy var board = BoardSplitController(hub: hub, home: home)
    private lazy var tabs = FleetTabsController(board: board, home: home)
    private lazy var waiting = CawWaiting(waiting: true, status: .loading, side: HomeViewController.cawSide)
    /// The hub whose fleet has been read once on this launch.
    private var readFrom: URL?
    private var shown: UIViewController?
    private var shownKey = ""
    private var initialSession: String?
    private var initialValues: [AnyHashable: Any]?

    public init(sessionId: String? = nil, boardTab: String? = nil) {
        initialSession = sessionId
        super.init(nibName: nil, bundle: nil)
        if let boardTab, let tab = HomeModel.Tab(rawValue: boardTab) { home.tab = tab }
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RootViewController is built in code")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
    }

    override public func refreshContent() {
        guard let address = hub.address else {
            show(key: "first-run") { ConnectViewController(hub: hub, mode: .firstRun) }
            return
        }
        if home.ready && home.live {
            readFrom = address
        }
        let read = readFrom == address
        if !read, hub.state == .unreachable {
            show(key: "reconnecting") { ConnectViewController(hub: hub, mode: .reconnecting) }
            return
        }
        waiting.content = tabs
        waiting.waiting = !read
        show(key: "board") { waiting }
        if read, let id = initialSession {
            initialSession = nil
            board.openSession(id)
            if let initialValues { board.selected?.restoreValues(initialValues); self.initialValues = nil }
        }
    }

    // MARK: Commands (the menu bar and the keyboard)

    /// The first ask in the needs-you queue, the card at its top: a session's
    /// permission or question (a run's is answered in its run).
    private var firstAsk: (ask: ParkedAsk, machineId: String)? {
        guard home.live else {
            return nil
        }
        if let selected = board.selected { return selected.answerTarget }
        for item in home.needs {
            if case let .ask(ask) = item.kind, !ask.isQuestion {
                // One answer at a time: an ask already answered here waits for the hub.
                let sent = hub.needs.answerSent(for: ask)
                return sent == nil || sent?.stage == .failed ? (ask, item.machineId) : nil
            }
        }
        return nil
    }

    /// Whether Approve and Deny have an ask to act on.
    public var canAnswer: Bool { firstAsk != nil }
    public var canControlSession: Bool { board.selected?.canControl == true }
    public func stopSession() { board.selected?.stopTurn() }
    public func steerSession() { board.selected?.focusComposer() }
    public var canOpenSessionWindow: Bool { board.selected != nil && UIApplication.shared.supportsMultipleScenes }
    public func openSessionWindow() {
        guard let selected = board.selected else { return }
        let request = UISceneSessionActivationRequest(role: .windowApplication, userActivity: SessionViewController.activity(selected.sessionId))
        UIApplication.shared.activateSceneSession(for: request) { error in
            Logger(subsystem: "dev.cawco.app", category: "Scene").error("new window refused: \(error.localizedDescription, privacy: .public)")
        }
    }
    public func closeScene() {
        board.selected?.close()
        home.stop()
        hub.disconnect()
    }
    public var restorationActivity: NSUserActivity {
        let activity = board.currentId.map { SessionViewController.activity($0) }
            ?? NSUserActivity(activityType: "dev.cawco.scene")
        var values = activity.userInfo ?? [:]
        values["boardTab"] = home.tab.rawValue
        if let selected = board.selected {
            for (key, value) in selected.restorationValues { values[key] = value }
        }
        activity.userInfo = values
        return activity
    }

    public func restore(_ activity: NSUserActivity) {
        if let name = activity.userInfo?["boardTab"] as? String, let tab = HomeModel.Tab(rawValue: name) {
            tabs.select(tab)
        }
        initialSession = activity.userInfo?["sessionId"] as? String
        initialValues = activity.userInfo
        requestRefresh()
    }

    /// Approves (or denies) the first card in the needs-you queue, as its own buttons do.
    public func answerFirstAsk(allow: Bool) {
        guard let first = firstAsk else {
            return
        }
        hub.needs.answer(first.ask, machineId: first.machineId, allow ? .allow : .deny)
    }

    /// Whether the socket is down and waiting out its backoff.
    public var canReconnect: Bool { hub.address != nil && hub.socket == .closed }

    /// Reconnects now instead of waiting out the backoff.
    public func reconnect() {
        hub.reconnectNow()
    }

    /// Puts `make()`'s controller on screen unless the one for `key` already is; the two cross-fade.
    private func show(key: String, _ make: () -> UIViewController) {
        guard key != shownKey else {
            return
        }
        shownKey = key
        let next = make()
        let previous = shown
        addChild(next)
        next.view.frame = view.bounds
        next.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(next.view)
        next.didMove(toParent: self)
        shown = next
        guard let previous else {
            return
        }
        previous.willMove(toParent: nil)
        next.view.alpha = 0
        let fade = Motion.easeOut.animator(Motion.durControl) {
            next.view.alpha = 1
        }
        fade.addCompletion { _ in
            previous.view.removeFromSuperview()
            previous.removeFromParent()
        }
        fade.startAnimation()
    }
}

/// The board, then the session: a split view whose primary column is the
/// home and whose secondary column waits for the session screen. On a
/// compact width it collapses to the home. Bar items live on each view
/// controller's `navigationItem`, so the bars stay the system's.
final class BoardSplitController: UISplitViewController, UISplitViewControllerDelegate {
    private let hub: HubConnection
    private let board: HomeViewController
    private(set) var selected: SessionViewController?
    private(set) var currentId: String?
    var onSelection: (HomeModel.Tab) -> Void = { _ in }

    init(hub: HubConnection, home: HomeModel) {
        self.hub = hub
        board = HomeViewController(hub: hub, home: home)
        super.init(style: .doubleColumn)
        board.onOpen = { [weak self] id in self?.openSession(id) }
        board.onSelectTab = { [weak self] tab in self?.onSelection(tab) }
        board.navigationItem.title = "Fleet"
        board.navigationItem.largeTitleDisplayMode = .never
        let change = UIBarButtonItem(title: "Hub", image: Glyph.server.image, primaryAction: UIAction { [weak self] _ in
            self?.changeHub()
        })
        change.accessibilityLabel = "Change hub"
        NavigationItems.configure(board.navigationItem, prominent: [change])

        let detail = UIViewController()
        detail.view.backgroundColor = Palette.surfacePage

        setViewController(UINavigationController(rootViewController: board), for: .primary)
        setViewController(UINavigationController(rootViewController: detail), for: .secondary)
        preferredDisplayMode = .oneBesideSecondary
        preferredSplitBehavior = .tile
        delegate = self
    }

    func selectTab(_ tab: HomeModel.Tab) { board.show(tab) }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BoardSplitController is built in code")
    }

    private func changeHub() {
        let connect = ConnectViewController(hub: hub, mode: .change) { [weak self] in
            self?.dismiss(animated: true)
        }
        connect.loadViewIfNeeded()
        present(HouseSheetController(connect, title: "Hub", scroller: connect.scroll), animated: true)
    }

    func openSession(_ id: String) {
        currentId = id
        if let runId = BoardRun.runId(of: id) {
            selected?.close(); selected = nil
            let controller = WorkflowRunViewController(hub: hub, runId: runId)
            controller.onReturn = { [weak self, weak controller] in self?.returnToFleet(from: controller) }
            controller.onOpen = { [weak self] id in self?.openSession(id) }
            showDetailViewController(UINavigationController(rootViewController: controller), sender: self)
            return
        }
        selected?.close()
        let controller = SessionViewController(hub: hub, id: id)
        selected = controller
        controller.onClose = { [weak self, weak controller] in
            if self?.selected === controller { self?.selected = nil }
        }
        controller.onReturnToFleet = { [weak self, weak controller] in
            self?.returnToFleet(from: controller)
        }
        controller.onQuestion = { [weak self] ask in self?.openQuestion(ask) }
        controller.onOpenSession = { [weak self] id in self?.openSession(id) }
        showDetailViewController(UINavigationController(rootViewController: controller), sender: self)
    }

    private func openQuestion(_ ask: ParkedAsk) {
        guard let row = hub.fleet.byId[ask.instanceId] else { return }
        selected?.close(); selected = nil; currentId = ask.instanceId
        let controller = QuestionAnswerViewController(hub: hub, ask: ask, machineId: row.machineId)
        controller.onReturn = { [weak self, weak controller] in self?.returnToFleet(from: controller) }
        showDetailViewController(UINavigationController(rootViewController: controller), sender: self)
    }

    private func returnToFleet(from controller: UIViewController?) {
        guard let controller else { return }
        currentId = nil
        selected?.close(); selected = nil
        if controller.traitCollection.horizontalSizeClass == .compact { show(.primary) }
        else {
            let empty = UIViewController(); empty.view.backgroundColor = Palette.surfacePage
            setViewController(UINavigationController(rootViewController: empty), for: .secondary)
        }
    }

    func splitViewController(_: UISplitViewController, topColumnForCollapsingToProposedTopColumn _: UISplitViewController.Column) -> UISplitViewController.Column {
        selected == nil ? .primary : .secondary
    }
}

/// System-managed sidebar on regular widths, the same fleet split in every
/// size class. The phone's board already contains its navigation controls.
private final class FleetTabsController: UITabBarController {
    private let board: BoardSplitController
    init(board: BoardSplitController, home: HomeModel) {
        self.board = board
        super.init(nibName: nil, bundle: nil)
        tabs = HomeModel.Tab.allCases.map { tab in
            UITab(title: tab.label, image: (tab == .working ? Glyph.bolt : Glyph.tick).image, identifier: tab.rawValue) { _ in
                BoardTabHostController(board: board, tab: tab)
            }
        }
        selectedTab = tabs.first { $0.identifier == home.tab.rawValue }
        board.onSelection = { [weak self] tab in self?.select(tab) }
        mode = .tabSidebar
        registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (controller: FleetTabsController, _: UITraitCollection) in controller.adapt() }
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("FleetTabsController is built in code") }
    override func viewWillAppear(_ animated: Bool) { super.viewWillAppear(animated); adapt() }
    func select(_ tab: HomeModel.Tab) {
        guard selectedTab?.identifier != tab.rawValue else { return }
        selectedTab = tabs.first { $0.identifier == tab.rawValue }
    }
    private func adapt() {
        tabBar.isHidden = traitCollection.horizontalSizeClass == .compact
        sidebar.isHidden = traitCollection.horizontalSizeClass == .compact
        #if !targetEnvironment(macCatalyst)
        if #available(iOS 27.1, *) { sidebar.preferredPlacement = .sidebar }
        #endif
    }
}

/// Sidebar destinations share the existing split view, rather than creating
/// private copies of a session, its draft or its scroll position. Containment
/// moves the shell; the one board stays mounted.
private final class BoardTabHostController: UIViewController {
    private let board: BoardSplitController
    private let destinationTab: HomeModel.Tab
    init(board: BoardSplitController, tab: HomeModel.Tab) {
        self.board = board
        destinationTab = tab
        super.init(nibName: nil, bundle: nil)
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("BoardTabHostController is built in code") }
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if board.parent !== self {
            board.willMove(toParent: nil)
            board.view.removeFromSuperview()
            board.removeFromParent()
            addChild(board)
            board.view.frame = view.bounds
            board.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(board.view)
            board.didMove(toParent: self)
        }
        board.selectTab(destinationTab)
    }
}
