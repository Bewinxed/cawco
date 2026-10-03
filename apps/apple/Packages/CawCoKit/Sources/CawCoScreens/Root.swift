public import UIKit
import CawCoCore
import CawCoDesign
import CawCoMascot

/// One window's interface: Connect until a hub is known and read, then the
/// board. The first read of the fleet is a real wait, so Caw stands in for
/// it once it outlasts the grace; from then on a drop keeps the board,
/// greyed, under its status line, as the web does.
public final class RootViewController: ObservedViewController {
    private let hub = HubConnection()
    private lazy var home = HomeModel(hub: hub)
    private lazy var board = BoardSplitController(hub: hub, home: home)
    private lazy var waiting = CawWaiting(waiting: true, status: .loading, side: HomeViewController.cawSide)
    /// The hub whose fleet has been read once on this launch.
    private var readFrom: URL?
    private var shown: UIViewController?
    private var shownKey = ""

    public init() {
        super.init(nibName: nil, bundle: nil)
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
        if home.ready {
            readFrom = address
        }
        let read = readFrom == address
        if !read, hub.state == .unreachable {
            show(key: "reconnecting") { ConnectViewController(hub: hub, mode: .reconnecting) }
            return
        }
        waiting.content = board
        waiting.waiting = !read
        show(key: "board") { waiting }
    }

    // MARK: Commands (the menu bar and the keyboard)

    /// The first ask in the needs-you queue, the card at its top: a session's
    /// permission or question (a run's is answered in its run).
    private var firstAsk: (ask: ParkedAsk, machineId: String)? {
        guard home.live else {
            return nil
        }
        for item in home.needs {
            if case let .ask(ask) = item.kind {
                // One answer at a time: an ask already answered here waits for the hub.
                return hub.needs.answerSent(for: ask) == nil ? (ask, item.machineId) : nil
            }
        }
        return nil
    }

    /// Whether Approve and Deny have an ask to act on.
    public var canAnswer: Bool { firstAsk != nil }

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

    init(hub: HubConnection, home: HomeModel) {
        self.hub = hub
        super.init(style: .doubleColumn)
        let homeController = HomeViewController(hub: hub, home: home)
        homeController.navigationItem.title = "Fleet"
        homeController.navigationItem.largeTitleDisplayMode = .never
        let change = UIBarButtonItem(title: "Hub", image: Glyph.server.image, primaryAction: UIAction { [weak self] _ in
            self?.changeHub()
        })
        change.accessibilityLabel = "Change hub"
        homeController.navigationItem.trailingItemGroups = [UIBarButtonItemGroup(barButtonItems: [change], representativeItem: nil)]

        let detail = UIViewController()
        detail.view.backgroundColor = Palette.surfacePage

        setViewController(UINavigationController(rootViewController: homeController), for: .primary)
        setViewController(UINavigationController(rootViewController: detail), for: .secondary)
        let compactHome = HomeViewController(hub: hub, home: home)
        compactHome.navigationItem.title = "Fleet"
        compactHome.navigationItem.largeTitleDisplayMode = .never
        let compactChange = UIBarButtonItem(title: "Hub", image: Glyph.server.image, primaryAction: UIAction { [weak self] _ in
            self?.changeHub()
        })
        compactChange.accessibilityLabel = "Change hub"
        compactHome.navigationItem.trailingItemGroups = [UIBarButtonItemGroup(barButtonItems: [compactChange], representativeItem: nil)]
        setViewController(UINavigationController(rootViewController: compactHome), for: .compact)
        preferredDisplayMode = .oneBesideSecondary
        preferredSplitBehavior = .tile
        delegate = self
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("BoardSplitController is built in code")
    }

    private func changeHub() {
        let connect = ConnectViewController(hub: hub, mode: .change) { [weak self] in
            self?.dismiss(animated: true)
        }
        let sheet = UINavigationController(rootViewController: connect)
        connect.navigationItem.title = "Hub"
        connect.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        sheet.sheetPresentationController?.detents = [.medium(), .large()]
        present(sheet, animated: true)
    }

    func splitViewController(_: UISplitViewController, topColumnForCollapsingToProposedTopColumn _: UISplitViewController.Column) -> UISplitViewController.Column {
        .primary
    }
}
