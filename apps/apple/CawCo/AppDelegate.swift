import CawCoScreens
import OSLog
import UIKit

/// The app: scene-based from the start (the 27 SDKs launch nothing else).
/// Every window is a scene, and `SceneDelegate` builds each one's interface.
/// The app delegate ends every responder chain, so it carries the menu
/// bar's commands and hands each to the key window's board.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
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
        let fleet = UIMenu(title: "Fleet", children: [
            UIMenu(options: .displayInline, children: [approve, deny]),
            UIMenu(options: .displayInline, children: [reconnect]),
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
}

/// One window: the root controller, which holds that window's connection to the hub.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo _: UISceneSession, options _: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else {
            return
        }
        Logger(subsystem: "dev.cawco.app", category: "Scene").info("window scene connected")
        let window = UIWindow(windowScene: scene)
        window.rootViewController = RootViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}
