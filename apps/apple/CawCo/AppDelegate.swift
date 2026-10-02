import CawCoScreens
import OSLog
import UIKit

/// The app: scene-based from the start (the 27 SDKs launch nothing else).
/// Every window is a scene, and `SceneDelegate` builds each one's interface.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_: UIApplication, configurationForConnecting session: UISceneSession, options _: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
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
