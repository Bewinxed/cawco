import CawCoScreens
import CawCoDesign
import OSLog
import UIKit

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
        return true
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
        let fleet = UIMenu(title: "Fleet", children: [
            UIMenu(options: .displayInline, children: [approve, deny]),
            UIMenu(options: .displayInline, children: [reconnect]),
            UIMenu(options: .displayInline, children: [stop, steer]),
        ])
        builder.insertSibling(fleet, afterMenu: .view)
    }

    override func validate(_ command: UICommand) {
        super.validate(command)
        switch command.action {
        case #selector(approveFirstAsk), #selector(denyFirstAsk):
            command.attributes = board?.canAnswer == true ? [] : .disabled
        case #selector(reconnectHub):
            command.attributes = board?.canReconnect == true ? [] : .disabled
        case #selector(stopSession), #selector(steerSession):
            command.attributes = board?.canControlSession == true ? [] : .disabled
        default:
            break
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
}

/// One window: the root controller, which holds that window's connection to the hub.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func stateRestorationActivity(for scene: UIScene) -> NSUserActivity? {
        (window?.rootViewController as? RootViewController)?.sessionActivity
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else {
            return
        }
        let activity = options.userActivities.first ?? session.stateRestorationActivity
        open(scene, sessionId: activity?.userInfo?["sessionId"] as? String)
    }

    /// Builds the scene's window: its root controller and its own hub connection.
    func open(_ scene: UIWindowScene, sessionId: String? = nil) {
        guard window == nil else {
            return
        }
        Logger(subsystem: "dev.cawco.app", category: "Scene").info("window scene connected")
        let window = UIWindow(windowScene: scene)
        window.tintColor = Palette.inkStrong
        var selectedSession = sessionId
        #if DEBUG
        // Proof runs enter the same scene route as an Open in New Window action.
        // No mock data, alternate connection or renderer participates.
        selectedSession = selectedSession ?? ProcessInfo.processInfo.environment["CAWCO_PROOF_SESSION"]
        if let appearance = ProcessInfo.processInfo.environment["CAWCO_PROOF_APPEARANCE"] {
            window.overrideUserInterfaceStyle = appearance == "dark" ? .dark : .light
        }
        #endif
        window.rootViewController = RootViewController(sessionId: selectedSession)
        window.makeKeyAndVisible()
        self.window = window
    }
}
