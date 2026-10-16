import CawCoCore
import CawCoScreens
import CawCoDesign
#if DEBUG
import notify
#endif
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
        Launch.prepare()
        UINavigationBar.appearance().titleTextAttributes = [.font: TypeScale.typeTitle.font, .foregroundColor: Palette.inkStrong]
        NotificationCenter.default.addObserver(self, selector: #selector(sceneWillConnect(_:)), name: UIScene.willConnectNotification, object: nil)
        // Pushes: the delegate is set before launch ends, so a tap that
        // launched the app and a lock-screen Approve both reach it.
        UNUserNotificationCenter.current().delegate = self
        // Hangs, crashes and CPU exceptions MetricKit reports, to the hub.
        DiagnosticsReporter.shared.start()
        // CawCo Pro: the listener and the entitlements before any window can gate on them.
        Pro.shared.start()
        #if DEBUG
        PushRegistry.shared.launch(environment: .sandbox)
        PushProbe.run()
        PushTaps.probe()
        #else
        PushRegistry.shared.launch(environment: .production)
        #endif
        NotificationSync.launch()
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        #if targetEnvironment(macCatalyst)
        // The Mac app stays open for days: each window made key sweeps too.
        NotificationCenter.default.addObserver(self, selector: #selector(windowBecameKey), name: UIWindow.didBecomeKeyNotification, object: nil)
        #endif
        return true
    }

    /// The hub's background push (`content-available`): its `cawco.cleared`
    /// removed and confirmed gone, the record reconciled, then the handler.
    func application(_: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        Task {
            await NotificationSync.background(userInfo)
            completionHandler(.newData)
        }
    }

    func application(_: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushRegistry.shared.adopt(deviceToken: deviceToken)
    }

    func application(_: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        PushRegistry.shared.failedToRegister(error)
    }

    /// Launch and every return to the front: the asks that are over, then the sweep.
    @objc private func becameActive() {
        Task {
            await PushRegistry.shared.becameActive()
            await NotificationSync.sweep("in front")
        }
    }

    @objc private func windowBecameKey() {
        Task { await NotificationSync.sweep("window key") }
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
        let splitRight = UIKeyCommand(title: "Split Right", action: #selector(splitRight), input: "\\", modifierFlags: .command)
        let splitDown = UIKeyCommand(title: "Split Down", action: #selector(splitDown), input: "\\", modifierFlags: [.command, .shift])
        for command in [start, jump, splitRight, splitDown] { command.wantsPriorityOverSystemBehavior = true }
        let fleet = UIMenu(title: "Fleet", children: [
            UIMenu(options: .displayInline, children: [start, jump]),
            UIMenu(options: .displayInline, children: [approve, deny]),
            UIMenu(options: .displayInline, children: [reconnect]),
            UIMenu(options: .displayInline, children: [stop, steer]),
            UIMenu(options: .displayInline, children: [splitRight, splitDown]),
            UIMenu(options: .displayInline, children: [newWindow]),
        ])
        builder.insertSibling(fleet, afterMenu: .view)
        // The app menu's settings item, where a Mac app keeps it, on its standard ⌘, (HIG Settings).
        let configure = UIKeyCommand(title: "Configure…", action: #selector(openConfigure), input: ",", modifierFlags: .command)
        configure.discoverabilityTitle = "Configure"
        configure.wantsPriorityOverSystemBehavior = true
        builder.insertSibling(UIMenu(options: .displayInline, children: [configure]), afterMenu: .about)
    }

    private static let shellCommands: [Selector: RootViewController.ShellCommand] = [
        #selector(startNewSession): .startSession, #selector(jumpToSession): .jump,
        #selector(splitRight): .splitRight, #selector(splitDown): .splitDown, #selector(openConfigure): .configure,
    ]

    override func validate(_ command: UICommand) {
        super.validate(command)
        switch command.action {
        case #selector(approveFirstAsk), #selector(denyFirstAsk):
            command.attributes = board?.canAnswer == true ? [] : .disabled
        case #selector(reconnectHub):
            command.attributes = board?.canReconnect == true ? [] : .disabled
        case #selector(stopSession):
            command.attributes = board?.canStopSession == true ? [] : .disabled
        case #selector(steerSession):
            command.attributes = board?.canSteerSession == true ? [] : .disabled
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
    @objc private func splitRight() { board?.run(.splitRight) }
    @objc private func splitDown() { board?.run(.splitDown) }
    @objc private func openConfigure() { board?.run(.configure) }
}

/// Tap or Open opens what the push names; Approve, a question's options and
/// "Other…", and Reply run in the background (`PushActions`).
/// The system may call this off the main thread, so it reads the response
/// where it is called, does the work on the main actor, and says it is done
/// from there: UIKit asserts that the completion runs on the main thread
/// (the `async` form of this method called it off it, and every tap crashed
/// in `_performBlockAfterCATransactionCommitSynchronizes:`).
extension AppDelegate: UNUserNotificationCenterDelegate {
    /// A push that lands while the app is in front shows as a banner with its
    /// sound, as it would on the lock screen: notification setup's test is
    /// one, and it must be seen and heard. It stays in Notification Centre
    /// after, with its actions, as one that arrived on the lock screen does.
    nonisolated func userNotificationCenter(_: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let note = PushNote(notification, action: UNNotificationDefaultActionIdentifier)
        if note.kind == "test" {
            Task { @MainActor in PushRegistry.shared.heardTest() }
        }
        // A passive push replaces one because the person acted (push.ts
        // `quiet`): it updates the list and never drops a banner over the app.
        completionHandler(notification.request.content.interruptionLevel == .passive ? [.list] : [.banner, .sound, .list])
    }

    nonisolated func userNotificationCenter(_: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let note = PushNote(response)
        nonisolated(unsafe) let done = completionHandler
        Task { @MainActor in
            await NotificationSync.respond(note) { PushTaps.deliver(note, to: nil) }
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
        Logger(subsystem: "dev.cawco.app", category: "Push").notice("open \(note.kind ?? "unknown", privacy: .public) push \(note.id, privacy: .public)")
        deliver(note.route, key: note.key, to: root)
    }

    /// The window in front takes the route, and its shell keeps it until it
    /// can land (ShellController `open`); with no window yet, the first takes it.
    static func deliver(_ route: PushRoute, key: String, to root: RootViewController?) {
        guard seen.insert(key).inserted else { return }
        if let root = root ?? front {
            root.open(route)
        } else {
            waiting = route
        }
    }

    #if DEBUG
    /// A simulator pass's tapped push, where `simctl push` and a banner tap
    /// can't be driven: `-push-route session:<id>`, `task:<projectId>/<taskId>`
    /// or `push:<the push's cawco data as JSON>` (routed by `PushNote.route`)
    /// at launch, before any window, as a tap that launched the app; and,
    /// running, the `debug-push-route` default on `dev.cawco.debug.push-route`
    /// (notifyutil). Each goes through `deliver`, as the delegate's tap does.
    static func probe() {
        let arguments = ProcessInfo.processInfo.arguments
        if let at = arguments.firstIndex(of: "-push-route"), arguments.indices.contains(at + 1), let route = probed(arguments[at + 1]) {
            deliver(route, key: "probe-launch", to: nil)
        }
        var token: Int32 = 0
        notify_register_dispatch("dev.cawco.debug.push-route", &token, .main) { _ in
            MainActor.assumeIsolated {
                guard let text = UserDefaults.standard.string(forKey: "debug-push-route"), let route = probed(text) else { return }
                deliver(route, key: "probe-\(Date().timeIntervalSince1970)", to: nil)
            }
        }
    }

    private static func probed(_ text: String) -> PushRoute? {
        let parts = text.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        switch parts[0] {
        // A push's own `cawco` data, as JSON: routed as its tap is (`PushNote.route`).
        case "push":
            // Read as a delivered push's are (`PushNote.fields`): its strings, its nulls left out.
            guard let data = parts[1].data(using: .utf8),
                  let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
            return PushNote.route(object.compactMapValues { $0 as? String })
        case "session": return .session(parts[1])
        case "task":
            let ids = parts[1].split(separator: "/", maxSplits: 1).map(String.init)
            return ids.count == 2 ? .task(projectId: ids[0], taskId: ids[1]) : nil
        default: return nil
        }
    }
    #endif

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
        // A new window's conversation, else the scene as it was left.
        open(scene, restoring: options.userActivities.first ?? session.stateRestorationActivity)
        let root = window?.rootViewController as? RootViewController
        // Launched cold by a tapped push: it opens the same way a warm tap does.
        if let response = options.notificationResponse, PushNote(response).action != UNNotificationDismissActionIdentifier {
            PushTaps.deliver(PushNote(response), to: root)
        }
        if let route = PushTaps.take() { root?.open(route) }
    }

    /// Builds the scene's window: its root controller and its own hub connection.
    func open(_ scene: UIWindowScene, restoring activity: NSUserActivity? = nil) {
        guard window == nil else {
            return
        }
        Logger(subsystem: "dev.cawco.app", category: "Scene").info("window scene connected")
        #if targetEnvironment(macCatalyst)
        // A Mac window is the web's page and nothing over it: no title
        // ("CawCo" stood over the tabs) and no toolbar. The shell's own bar
        // is the top of the window (TopBar `dress`).
        if let titlebar = scene.titlebar {
            titlebar.titleVisibility = .hidden
            titlebar.toolbar = nil
        }
        #endif
        let window = ReachWindow(windowScene: scene)
        window.tintColor = Palette.inkStrong
        #if DEBUG
        // A simulator pass at the paywall alone, with no hub (PaywallProbe).
        window.rootViewController = PaywallProbe.asked ? PaywallProbe.root() : RootViewController(restoring: activity)
        #else
        window.rootViewController = RootViewController(restoring: activity)
        #endif
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
