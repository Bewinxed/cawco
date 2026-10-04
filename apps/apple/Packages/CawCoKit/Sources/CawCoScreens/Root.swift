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
    private lazy var board = ShellController(hub: hub, home: home)
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

    override public func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        // The scheme the reader chose in the rail, on this window too.
        Theme.apply(to: view.window)
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
        waiting.content = board
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
    /// The shell's own commands (Shell.svelte `shortcut`, and Start session's
    /// ⇧⌘N), for the menu bar and a hardware keyboard.
    public enum ShellCommand: Sendable { case jump, assistant, startSession, splitRight, splitDown }

    public func canRun(_ command: ShellCommand) -> Bool {
        shownKey == "board" && !waiting.waiting && board.can(command)
    }

    public func run(_ command: ShellCommand) {
        guard canRun(command) else { return }
        board.perform(command)
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
            home.tab = tab
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
        // A screen with Caw on it is going: he plays his exit over the one that arrives.
        (previous as? ConnectViewController)?.caw?.leave(over: view)
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
