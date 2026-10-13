import Foundation
import OSLog
public import UIKit

/// Which session this device has in front, told to the hub
/// (`POST /api/presence`), which then sends no notification for it anywhere.
///
/// Active is a window of this app in front and taking input (its scene
/// `.foregroundActive`, its window key, the app active: on the Mac, the key
/// window of the frontmost app) with a session in front in it: the shell's
/// own rule for what the person looks at (`ShellController.lookAtFront`,
/// the focused group's chosen tab). Inactive is said at once on resigning
/// active, going to the background, or leaving the session. While active,
/// a beat goes every 30 s from a main run loop timer in the common modes, so
/// it fires through a scroll's tracking too, and only while the app runs;
/// the hub counts a client gone 60 s after its last beat.
@MainActor
public final class Presence {
    public static let shared = Presence()

    private struct Window {
        weak var scene: UIWindowScene?
        var sessionId: String?
        /// Between the scene's will-deactivate and its next did-activate.
        var resigned: Bool
    }

    private struct State: Equatable {
        var sessionId: String?
        var active: Bool { sessionId != nil }
    }

    private static let beatEvery: TimeInterval = 30
    private static let clientKey = "cawco-presence-client"
    private let log = Logger(subsystem: "dev.cawco.app", category: "Presence")
    /// Stable per install.
    private let clientId: String
    private var windows: [ObjectIdentifier: Window] = [:]
    /// Between the app's will-resign-active and its next did-become-active.
    private var appResigned = false
    private var sent: State?
    private var beat: Timer?
    /// The post said last: the next one waits for it to be answered, so the
    /// hub hears them in the order they were said. Two at once go out on
    /// separate connections and can land the other way round, leaving the
    /// hub on the older one until the next beat.
    private var lastPost: Task<Void, Never>?

    private init() {
        if let kept = UserDefaults.standard.string(forKey: Self.clientKey) {
            clientId = kept
        } else {
            clientId = UUID().uuidString.lowercased()
            UserDefaults.standard.set(clientId, forKey: Self.clientKey)
        }
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(sceneActivated(_:)), name: UIScene.didActivateNotification, object: nil)
        center.addObserver(self, selector: #selector(sceneResigned(_:)), name: UIScene.willDeactivateNotification, object: nil)
        center.addObserver(self, selector: #selector(sceneResigned(_:)), name: UIScene.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appActivated), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appResigning), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(keyChanged), name: UIWindow.didBecomeKeyNotification, object: nil)
        center.addObserver(self, selector: #selector(keyChanged), name: UIWindow.didResignKeyNotification, object: nil)
    }

    /// A window's shell says which session it has in front, nil for none.
    public func front(_ sessionId: String?, in scene: UIWindowScene) {
        let key = ObjectIdentifier(scene)
        let resigned = windows[key]?.resigned ?? (scene.activationState != .foregroundActive)
        windows[key] = Window(scene: scene, sessionId: sessionId, resigned: resigned)
        update("front")
    }

    @objc private func sceneActivated(_ note: Notification) {
        mark(note, resigned: false)
    }

    @objc private func sceneResigned(_ note: Notification) {
        mark(note, resigned: true)
    }

    private func mark(_ note: Notification, resigned: Bool) {
        guard let scene = note.object as? UIWindowScene, var window = windows[ObjectIdentifier(scene)] else { return }
        window.resigned = resigned
        windows[ObjectIdentifier(scene)] = window
        update(resigned ? "scene resigned" : "scene active")
    }

    @objc private func appActivated() {
        appResigned = false
        update("app active")
    }

    @objc private func appResigning() {
        appResigned = true
        update("app resigning")
    }

    @objc private func keyChanged() {
        update("key window")
    }

    /// The key window's session, when it is in front and taking input.
    private var current: State {
        guard !appResigned, UIApplication.shared.applicationState != .background else { return State() }
        windows = windows.filter { $0.value.scene != nil }
        for window in windows.values {
            guard let scene = window.scene, !window.resigned, scene.activationState == .foregroundActive,
                  scene.keyWindow?.isKeyWindow == true, let sessionId = window.sessionId else { continue }
            return State(sessionId: sessionId)
        }
        return State()
    }

    private func update(_ why: String) {
        let now = current
        if now != sent {
            sent = now
            post(now, why)
        }
        if now.active {
            guard beat == nil else { return }
            // `.common`, not the default mode alone: a scroll runs the main
            // run loop in its tracking mode, where a default-mode timer waits.
            let timer = Timer(timeInterval: Self.beatEvery, repeats: true) { _ in
                MainActor.assumeIsolated { Presence.shared.beatNow() }
            }
            RunLoop.main.add(timer, forMode: .common)
            beat = timer
        } else {
            beat?.invalidate()
            beat = nil
        }
    }

    private func beatNow() {
        guard let sent, sent.active else { return }
        post(sent, "beat")
    }

    /// One presence, sent after the one before it; going inactive asks for
    /// the time to finish it in the background, so the hub hears it before
    /// the app is suspended.
    private func post(_ state: State, _ why: String) {
        guard let hub = HubConnection.keptAddress else { return }
        #if targetEnvironment(macCatalyst)
        let client = "mac"
        #else
        let client = "ios"
        #endif
        var request = URLRequest(url: hub.appending(path: "api/presence"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        // `sessionId` is sent as null, not left out, when there is none.
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "clientId": clientId, "client": client, "sessionId": state.sessionId.map { $0 as Any } ?? NSNull(), "active": state.active,
        ])
        let session = state.sessionId ?? "none"
        let active = state.active
        let application = UIApplication.shared
        let background = active ? .invalid : application.beginBackgroundTask(withName: "presence") {}
        let previous = lastPost
        lastPost = Task { [log] in
            await previous?.value
            let status: Int
            do {
                let (_, response) = try await URLSession.shared.data(for: request)
                status = (response as? HTTPURLResponse)?.statusCode ?? 0
            } catch {
                status = 0
                log.error("presence \(why, privacy: .public): not sent: \(String(describing: error), privacy: .public)")
            }
            log.notice("presence \(why, privacy: .public): active \(active) session \(session, privacy: .public), hub answered \(status)")
            if background != .invalid { application.endBackgroundTask(background) }
        }
    }
}
