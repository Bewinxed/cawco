import CawCoCore
import CawCoScreens
import CawCoDesign
import OSLog
import UIKit
import UserNotifications

/// The app: scene-based from the start (the 27 SDKs launch nothing else).
/// Every window is a scene, and `SceneDelegate` builds each one's interface.
/// The app delegate ends every responder chain, so it carries the menu
/// bar's commands and hands each to the key window's board.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    /// A device that ran the SwiftUI build kept that build's window session,
    /// and UIKit reconnects a kept session with the delegate it was saved
    /// with (SwiftUI's `AppSceneDelegate`, still in the process through
    /// RiveRuntime) without asking `configurationForConnecting`: the window
    /// came up black until the app was deleted. Ending that session needs
    /// multiple-scene support an iPhone refuses ("The current device does not
    /// support multiple scenes"), so a window scene that connects with any
    /// other delegate is handed this app's own, which builds its window.
    func application(_: UIApplication, didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UINavigationBar.appearance().titleTextAttributes = [.font: TypeScale.typeTitle.font, .foregroundColor: Palette.inkStrong]
        NotificationCenter.default.addObserver(self, selector: #selector(sceneWillConnect(_:)), name: UIScene.willConnectNotification, object: nil)
        // Pushes: the delegate is set before launch ends, so a tap that
        // launched the app and a lock-screen Approve both reach it.
        UNUserNotificationCenter.current().delegate = self
        // Hangs, crashes and CPU exceptions MetricKit reports, to the hub.
        DiagnosticsReporter.shared.start()
        #if DEBUG
        PushRegistry.shared.launch(environment: .sandbox)
        #else
        PushRegistry.shared.launch(environment: .production)
        #endif
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        return true
    }

    func application(_: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushRegistry.shared.adopt(deviceToken: deviceToken)
    }

    func application(_: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        PushRegistry.shared.failedToRegister(error)
    }

    @objc private func becameActive() {
        Task { await PushRegistry.shared.becameActive() }
    }

    @objc private func sceneWillConnect(_ note: Notification) {
        guard let scene = note.object as? UIWindowScene, let current = scene.delegate, !(current is SceneDelegate) else {
            return
        }
        Logger(subsystem: "dev.cawco.app", category: "Scene").info("a saved window session connected with another build's delegate; taking it over")
        let delegate = SceneDelegate()
        scene.delegate = delegate
        delegate.open(scene)
    }

    func application(_: UIApplication, configurationForConnecting session: UISceneSession, options _: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    // MARK: Commands

    /// The Fleet menu: Approve and Deny act on the first card in the
    /// needs-you queue; Reconnect skips the wait before the next attempt.
    /// Each is a key command too, on a hardware keyboard on any device.
    override func buildMenu(with builder: any UIMenuBuilder) {
        super.buildMenu(with: builder)
        guard builder.system == .main else {
            return
        }
        let approve = UIKeyCommand(title: "Approve", action: #selector(approveFirstAsk), input: "\r", modifierFlags: .command)
        approve.discoverabilityTitle = "Approve the first ask"
        let deny = UIKeyCommand(title: "Deny", action: #selector(denyFirstAsk), input: UIKeyCommand.inputDelete, modifierFlags: .command)
        deny.discoverabilityTitle = "Deny the first ask"
        let reconnect = UIKeyCommand(title: "Reconnect", action: #selector(reconnectHub), input: "r", modifierFlags: .command)
        reconnect.discoverabilityTitle = "Reconnect to the hub"
        let stop = UIKeyCommand(title: "Stop", action: #selector(stopSession), input: ".", modifierFlags: .command)
        let steer = UIKeyCommand(title: "Steer", action: #selector(steerSession), input: "l", modifierFlags: .command)
        let newWindow = UIKeyCommand(title: "Open session in new window", action: #selector(openSessionWindow), input: "n", modifierFlags: [.command, .alternate])
        // The shell's own (Shell.svelte `shortcut`; Sidebar.svelte's ⇧⌘N).
        let start = UIKeyCommand(title: "Start Session", action: #selector(startNewSession), input: "n", modifierFlags: [.command, .shift])
        let jump = UIKeyCommand(title: "Jump to Session…", action: #selector(jumpToSession), input: "k", modifierFlags: .command)
        let assistant = UIKeyCommand(title: "Assistant", action: #selector(toggleAssistant), input: "j", modifierFlags: .command)
        let splitRight = UIKeyCommand(title: "Split Right", action: #selector(splitRight), input: "\\", modifierFlags: .command)
        let splitDown = UIKeyCommand(title: "Split Down", action: #selector(splitDown), input: "\\", modifierFlags: [.command, .shift])
        for command in [start, jump, assistant, splitRight, splitDown] { command.wantsPriorityOverSystemBehavior = true }
        let fleet = UIMenu(title: "Fleet", children: [
            UIMenu(options: .displayInline, children: [start, jump, assistant]),
            UIMenu(options: .displayInline, children: [approve, deny]),
            UIMenu(options: .displayInline, children: [reconnect]),
            UIMenu(options: .displayInline, children: [stop, steer]),
            UIMenu(options: .displayInline, children: [splitRight, splitDown]),
            UIMenu(options: .displayInline, children: [newWindow]),
        ])
        builder.insertSibling(fleet, afterMenu: .view)
    }

    private static let shellCommands: [Selector: RootViewController.ShellCommand] = [
        #selector(startNewSession): .startSession, #selector(jumpToSession): .jump, #selector(toggleAssistant): .assistant,
        #selector(splitRight): .splitRight, #selector(splitDown): .splitDown,
    ]

    override func validate(_ command: UICommand) {
        super.validate(command)
        switch command.action {
        case #selector(approveFirstAsk), #selector(denyFirstAsk):
            command.attributes = board?.canAnswer == true ? [] : .disabled
        case #selector(reconnectHub):
            command.attributes = board?.canReconnect == true ? [] : .disabled
        case #selector(stopSession), #selector(steerSession):
            command.attributes = board?.canControlSession == true ? [] : .disabled
        case #selector(openSessionWindow):
            command.attributes = board?.canOpenSessionWindow == true ? [] : .disabled
        default:
            if let shell = Self.shellCommands[command.action] {
                command.attributes = board?.canRun(shell) == true ? [] : .disabled
            }
        }
    }

    /// The board in the window that has the keyboard.
    private var board: RootViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.keyWindow
        return window?.rootViewController as? RootViewController
    }

    @objc private func approveFirstAsk() {
        board?.answerFirstAsk(allow: true)
    }

    @objc private func denyFirstAsk() {
        board?.answerFirstAsk(allow: false)
    }

    @objc private func reconnectHub() {
        board?.reconnect()
    }
    @objc private func stopSession() { board?.stopSession() }
    @objc private func steerSession() { board?.steerSession() }
    @objc private func openSessionWindow() { board?.openSessionWindow() }
    @objc private func startNewSession() { board?.run(.startSession) }
    @objc private func jumpToSession() { board?.run(.jump) }
    @objc private func toggleAssistant() { board?.run(.assistant) }
    @objc private func splitRight() { board?.run(.splitRight) }
    @objc private func splitDown() { board?.run(.splitDown) }
}

/// Tap or Open opens what the push names; Approve answers in the background.
/// The system may call this off the main thread, so it reads the response
/// where it is called, does the work on the main actor, and says it is done
/// from there: UIKit asserts that the completion runs on the main thread
/// (the `async` form of this method called it off it, and every tap crashed
/// in `_performBlockAfterCATransactionCommitSynchronizes:`).
extension AppDelegate: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let note = PushNote(response)
        nonisolated(unsafe) let done = completionHandler
        Task { @MainActor in
            switch note.action {
            case PushCategories.approve:
                await PushApproval.approve(note)
            case UNNotificationDefaultActionIdentifier, PushCategories.open:
                PushTaps.deliver(note, to: nil)
            default:
                break
            }
            done()
        }
    }
}

/// Each tapped push is routed once, to the window in front; one that lands
/// before any window exists waits for the first.
@MainActor
enum PushTaps {
    private static var seen: Set<String> = []
    private static var waiting: PushRoute?

    static func deliver(_ note: PushNote, to root: RootViewController?) {
        guard seen.insert(note.key).inserted else { return }
        Logger(subsystem: "dev.cawco.app", category: "Push").notice("open \(note.kind ?? "unknown", privacy: .public) push \(note.id, privacy: .public)")
        if let root = root ?? front {
            root.open(note.route)
        } else {
            waiting = note.route
        }
    }

    static func take() -> PushRoute? {
        defer { waiting = nil }
        return waiting
    }

    private static var front: RootViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first { $0.activationState == .foregroundInactive } ?? scenes.first
        return scene?.keyWindow?.rootViewController as? RootViewController ?? scene?.windows.first?.rootViewController as? RootViewController
    }
}

/// One window: the root controller, which holds that window's connection to the hub.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func stateRestorationActivity(for scene: UIScene) -> NSUserActivity? {
        (window?.rootViewController as? RootViewController)?.restorationActivity
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else {
            return
        }
        let activity = options.userActivities.first ?? session.stateRestorationActivity
        open(scene, sessionId: activity?.userInfo?["sessionId"] as? String, boardTab: activity?.userInfo?["boardTab"] as? String)
        let root = window?.rootViewController as? RootViewController
        if let activity { root?.restore(activity) }
        // Launched cold by a tapped push: it opens the same way a warm tap does.
        if let response = options.notificationResponse, PushNote(response).action != UNNotificationDismissActionIdentifier {
            PushTaps.deliver(PushNote(response), to: root)
        }
        if let route = PushTaps.take() { root?.open(route) }
    }

    /// Builds the scene's window: its root controller and its own hub connection.
    func open(_ scene: UIWindowScene, sessionId: String? = nil, boardTab: String? = nil) {
        guard window == nil else {
            return
        }
        Logger(subsystem: "dev.cawco.app", category: "Scene").info("window scene connected")
        let window = UIWindow(windowScene: scene)
        window.tintColor = Palette.inkStrong
        window.rootViewController = RootViewController(sessionId: sessionId, boardTab: boardTab)
        window.makeKeyAndVisible()
        self.window = window
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        (window?.rootViewController as? RootViewController)?.restore(userActivity)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        scene.userActivity = (window?.rootViewController as? RootViewController)?.restorationActivity
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        (window?.rootViewController as? RootViewController)?.closeScene()
        window = nil
    }
}
