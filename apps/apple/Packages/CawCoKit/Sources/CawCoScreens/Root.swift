public import UIKit
public import CawCoCore
import CawCoDesign
import CawCoMascot
#if DEBUG
import notify
#endif
import OSLog

/// One window's interface: Connect until a hub is kept, then the board. The
/// first read of the fleet is a real wait, so Caw stands in for it once it
/// outlasts the grace, while the hub is being reached; a hub that does not
/// answer, or that Local Network privacy refuses, is said by the board's
/// status line, and from then on a drop keeps the board, greyed, under that
/// line, as the web does.
public final class RootViewController: ObservedViewController {
    private let hub = HubConnection()
    private lazy var home = HomeModel(hub: hub)
    private lazy var board = ShellController(hub: hub, home: home)
    private lazy var waiting = CawWaiting(waiting: true, status: .loading, side: HomeViewController.cawSide)
    /// CawCo Pro over this window's board: the lock, the gate bar and the paywall.
    private lazy var gate = PaywallGate(hub: hub, home: home, shell: board)
    /// The hub whose fleet has been read once on this launch.
    private var readFrom: URL?
    private var shown: UIViewController?
    private var shownKey = ""
    #if DEBUG
    /// What the shell last said it shows (`refreshContent`, `show`).
    private var shellSaid = ""
    #endif

    /// A window, put back as its scene left it when `activity` is the scene's
    /// saved one (or a new window's conversation); the shell lands there once
    /// the fleet is read.
    public init(restoring activity: NSUserActivity? = nil) {
        super.init(nibName: nil, bundle: nil)
        let landing = activity.map(landing(from:)) ?? ShellLanding()
        #if DEBUG
        board.land(Self.probing(landing))
        pushRoute = Self.probedTask
        #else
        board.land(landing)
        #endif
    }

    #if DEBUG
    /// A simulator pass's `-open-session <id>[,<id>…]`: these conversations
    /// land the way a restored scene's does, as tabs, the last in front.
    private static func probing(_ landing: ShellLanding) -> ShellLanding {
        let arguments = ProcessInfo.processInfo.arguments
        guard let at = arguments.firstIndex(of: "-open-session"), arguments.indices.contains(at + 1) else { return landing }
        var probed = landing
        probed.sessionIds = arguments[at + 1].split(separator: ",").map(String.init)
        return probed
    }

    /// A simulator pass's `-open-task <projectId>/<taskId>`: the task's sheet
    /// over its project's page, opened as a tapped `task` push opens it, once
    /// the fleet is read.
    private static var probedTask: PushRoute? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let at = arguments.firstIndex(of: "-open-task"), arguments.indices.contains(at + 1) else { return nil }
        let parts = arguments[at + 1].split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        return .task(projectId: parts[0], taskId: parts[1], attempt: nil)
    }
    #endif

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RootViewController is built in code")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.surfaceRecess
        gate.attach(to: view)
        gate.onChange = { [weak self] in self?.requestRefresh() }
        board.onKeepPro = { [weak self] in self?.gate.keepPro() }
    }

    override public func viewIsAppearing(_ animated: Bool) {
        super.viewIsAppearing(animated)
        // The scheme the reader chose in the rail, on this window too.
        Theme.apply(to: view.window)
        watchScene()
    }

    // MARK: Background and foreground

    private var sceneWatch: [any NSObjectProtocol] = []

    /// This window's scene, not the app: on an iPad a window in the
    /// background closes its own hub socket while another stays in front.
    private func watchScene() {
        guard sceneWatch.isEmpty, let scene = view.window?.windowScene else { return }
        let center = NotificationCenter.default
        sceneWatch = [
            center.addObserver(forName: UIScene.didEnterBackgroundNotification, object: scene, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.wentToBackground() }
            },
            center.addObserver(forName: UIScene.willEnterForegroundNotification, object: scene, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.hub.enterForeground() }
            },
            // Active again, a Mac's window back from System Settings included:
            // what Local Network privacy refused is tried again at once.
            center.addObserver(forName: UIScene.didActivateNotification, object: scene, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.hub.becameActive() }
            },
        ]
        #if DEBUG
        // A Mac window back from System Settings is activated without leaving
        // the foreground; the simulator cannot do that alone. A pass posts
        // `dev.cawco.debug.became-active` (notifyutil) and this scene hears
        // the activation by itself.
        var token: Int32 = 0
        notify_register_dispatch("dev.cawco.debug.became-active", &token, .main) { [weak scene] _ in
            MainActor.assumeIsolated { NotificationCenter.default.post(name: UIScene.didActivateNotification, object: scene) }
        }
        LocalNetwork.allowOnDebugSignal()
        #endif
    }

    /// The socket closes, and the screens redraw before this returns: iOS
    /// takes the snapshot it shows on the way back after it, and that
    /// snapshot must read the hub as connecting, never the board as it was.
    private func wentToBackground() {
        hub.enterBackground()
        Self.refresh(self)
        view.window?.layoutIfNeeded()
    }

    private static func refresh(_ controller: UIViewController) {
        (controller as? ObservedViewController)?.requestRefresh()
        for child in controller.children { refresh(child) }
        if let presented = controller.presentedViewController, presented.presentingViewController === controller {
            refresh(presented)
        }
    }

    override public func refreshContent() {
        // The gate reads what this pass decided: whether the board is up, and read.
        defer { gate.update(onBoard: shownKey == "board", read: hub.address != nil && readFrom == hub.address) }
        guard let address = hub.address else {
            show(key: "first-run") { ConnectViewController(hub: hub, mode: .firstRun) }
            return
        }
        if home.ready && home.live {
            readFrom = address
        }
        let read = readFrom == address
        // A hub this app cannot read is said once, in place of a wait that would never end.
        if !read, let incompatible = hub.incompatible {
            show(key: "mismatch:\(incompatible.hubVersion ?? "")") { HubMismatchController(hub: hub, incompatible: incompatible) }
            return
        }
        // A kept hub that does not answer, or that Local Network privacy keeps
        // this app from, leaves the shell where it is: the board, with what it
        // holds, says so in its status line (and Open Settings for the
        // refusal), never the setup screen and never a wait that hides that
        // line. Setup is for a hub not yet kept; another address is the hub
        // sheet's (`ConnectViewController` `.change`).
        waiting.content = board
        waiting.waiting = !read && hub.state != .unreachable && !hub.localNetworkDenied
        #if DEBUG
        let said = "board, \(waiting.waiting ? "waiting" : "drawn")"
        if said != shellSaid {
            shellSaid = said
            Logger(subsystem: "dev.cawco.app", category: "Transcript").notice("shell shows \(said, privacy: .public)")
        }
        #endif
        show(key: "board") { waiting }
        // After the first full read, `/api/pending` included: an ask's
        // session opens with its card in view, never an empty pane.
        if read, let route = pushRoute {
            pushRoute = nil
            switch route {
            case let .session(id): board.openSession(id)
            case let .project(id): board.go(.project(id))
            case let .task(projectId, taskId, attempt): board.openTask(projectId: projectId, taskId: taskId, attempt: attempt)
            case .board: board.go(.fleet)
            case .keepPro: gate.keepPro()
            }
        }
    }

    /// Where a tapped push opens, waiting for the fleet's first read.
    private var pushRoute: PushRoute?

    /// Opens what a tapped push names (PushNote.route).
    public func open(_ route: PushRoute) {
        pushRoute = route
        requestRefresh()
    }

    // MARK: Commands (the menu bar and the keyboard)

    /// The first ask in the needs-you queue, the card at its top: a session's
    /// permission or question (a run's is answered in its run).
    private var firstAsk: (ask: ParkedAsk, machineId: String)? {
        guard home.live, !gate.isLocked else {
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
    public var canStopSession: Bool { !gate.isLocked && board.selected?.canStop == true }
    public var canSteerSession: Bool { !gate.isLocked && board.selected?.canSend == true }
    public func stopSession() {
        guard canStopSession else { return }
        board.selected?.stopTurn()
    }

    public func steerSession() {
        guard canSteerSession else { return }
        board.selected?.focusComposer()
    }

    public var canOpenSessionWindow: Bool { !gate.isLocked && board.selected != nil && UIApplication.shared.supportsMultipleScenes }
    public func openSessionWindow() {
        guard canOpenSessionWindow, let selected = board.selected else { return }
        let request = UISceneSessionActivationRequest(role: .windowApplication, userActivity: SessionViewController.activity(selected.sessionId))
        UIApplication.shared.activateSceneSession(for: request) { error in
            Logger(subsystem: "dev.cawco.app", category: "Scene").error("new window refused: \(error.localizedDescription, privacy: .public)")
        }
    }
    /// The shell's own commands (Shell.svelte `shortcut`, and Start session's
    /// ⇧⌘N), for the menu bar and a hardware keyboard.
    public enum ShellCommand: Sendable { case jump, assistant, startSession, splitRight, splitDown }

    public func canRun(_ command: ShellCommand) -> Bool {
        shownKey == "board" && !waiting.waiting && !gate.isLocked && board.can(command)
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
    /// What the scene keeps when it goes to the background: the place in
    /// front, the conversation when it is the page in front with its draft and
    /// its place in the transcript, and Home's tab.
    public var restorationActivity: NSUserActivity {
        let state = board.restoration
        let activity = state.sessionId.map { SessionViewController.activity($0) }
            ?? NSUserActivity(activityType: "dev.cawco.scene")
        var values = activity.userInfo ?? [:]
        values["boardTab"] = home.tab.rawValue
        values["place"] = state.place.route
        if let selected = board.selected, selected.sessionId == state.sessionId {
            for (key, value) in selected.restorationValues { values[key] = value }
        }
        activity.userInfo = values
        return activity
    }

    /// An activity handed to a window already up (a conversation continued in it): it lands there.
    public func restore(_ activity: NSUserActivity) {
        board.land(landing(from: activity))
    }

    private func landing(from activity: NSUserActivity) -> ShellLanding {
        let values = activity.userInfo
        if let name = values?["boardTab"] as? String, let tab = HomeModel.Tab(rawValue: name) {
            home.tab = tab
        }
        return ShellLanding(place: (values?["place"] as? String).flatMap(ShellDestination.init(route:)),
                            sessionIds: (values?["sessionId"] as? String).map { [$0] } ?? [],
                            values: values)
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
        #if DEBUG
        // Which screen a window stands on, for a simulator pass to read.
        if key != "board" {
            shellSaid = key
            Logger(subsystem: "dev.cawco.app", category: "Transcript").notice("shell shows \(key, privacy: .public)")
        }
        #endif
        let next = make()
        let previous = shown
        addChild(next)
        next.view.frame = view.bounds
        next.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(next.view)
        next.didMove(toParent: self)
        shown = next
        // A screen with Caw on it is going: he fades out over the one that arrives.
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
