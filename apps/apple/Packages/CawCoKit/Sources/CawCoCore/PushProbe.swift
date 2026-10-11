#if DEBUG
import Foundation
import OSLog
import UIKit
import UserNotifications

/// The push actions' simulator probe (scripts/probe-ios-push-actions.ts),
/// in DEBUG builds only, by launch argument:
///
/// - `-push-probe-register`: asks for notifications, waits for this launch's
///   APNs token, then registers this device's pairing and push key with the
///   kept hub (`probeRegister`), so the hub seals its pushes for this simulator.
/// - `-push-probe-list`: logs every delivered notification, its category and
///   that category's actions.
/// - `-push-probe-act <notification id> <action> [<text>]`: runs the action
///   on that delivered notification through `PushActions.perform`, the entry
///   the notification centre's delegate calls with a response, then lists.
///   A simulator can't press a notification's action from a script, and
///   `UNNotificationResponse` has no public initializer, so the probe makes the
///   `PushNote` the delegate would from the notification and the action.
///
/// Everything it logs is public, under category `PushProbe`.
@MainActor
public enum PushProbe {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "PushProbe")

    public static func run() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-push-probe-register") {
            Task { await register() }
        }
        if args.contains("-push-probe-list") {
            Task { await list("listed") }
        }
        if let at = args.firstIndex(of: "-push-probe-act"), args.count > at + 2 {
            let id = args[at + 1]
            let action = args[at + 2]
            let text = args.count > at + 3 && !args[at + 3].hasPrefix("-") ? args[at + 3] : nil
            Task { await act(id, action: action, text: text) }
        }
    }

    /// The real path, each step logged as it is reached: iOS asks (the probe
    /// answers its alert), APNs gives this launch a token, then the pairing and
    /// push key register with the hub. A step that doesn't come says so in
    /// `probe registered:`, and nothing after it runs.
    ///
    /// It asks as "Turn on notifications" does (`PushRegistry.turnOn`): from a
    /// window in front, not from `didFinishLaunching`, where `run()` starts it.
    /// iOS's word on notifications is logged before the ask, and again if no
    /// answer has come 45 s after it, so a prompt that never showed tells
    /// "already decided" from "asked and not shown". Each step says how long
    /// it took and what the scenes were, so a hook that never asks shows
    /// whether it waited on a window in front or on iOS's word, which queues
    /// behind every earlier call on `NotificationCentre`'s serial queue
    /// (`PushCategory.install` waits up to 5 s on each of its three answers).
    private static func register() async {
        let started = ContinuousClock.now
        log.notice("probe register: started (scenes \(scenes, privacy: .public))")
        let frontBy = started + .seconds(30)
        while !inFront, ContinuousClock.now < frontBy {
            try? await Task.sleep(for: .milliseconds(100))
        }
        let frontAfter = String(describing: started.duration(to: ContinuousClock.now))
        log.notice("probe register: in front \(inFront) after \(frontAfter, privacy: .public) (scenes \(scenes, privacy: .public)), reading iOS's word")
        let reading = ContinuousClock.now
        let before = await NotificationCentre.authorization()
        let readIn = String(describing: reading.duration(to: ContinuousClock.now))
        log.notice("probe register: asking for notifications (in front \(inFront), authorization \(name(before), privacy: .public), read in \(readIn, privacy: .public))")
        let waiting = Task {
            try await Task.sleep(for: .seconds(45))
            let now = await NotificationCentre.authorization()
            log.notice("probe register: no answer 45 s after asking (in front \(inFront), authorization \(name(now), privacy: .public))")
        }
        let granted = (try? await NotificationCentre.requestAuthorization([.alert, .sound, .badge])) ?? false
        waiting.cancel()
        log.notice("probe authorization: \(granted ? "allowed" : "not allowed", privacy: .public)")
        guard granted else {
            log.notice("probe registered: notifications not allowed")
            return
        }
        let push = PushRegistry.shared
        await push.readAuthorization()
        if push.token == nil { push.requestToken() }
        let deadline = ContinuousClock.now + .seconds(30)
        while push.token == nil, !push.tokenFailed, ContinuousClock.now < deadline {
            try? await Task.sleep(for: .milliseconds(250))
        }
        guard let token = push.token else {
            log.notice("probe registered: no APNs token (\(push.tokenFailed ? "APNs refused the registration" : "none in 30 s", privacy: .public))")
            return
        }
        log.notice("probe token: …\(String(token.suffix(6)), privacy: .public)")
        let problem = await push.probeRegister()
        log.notice("probe registered: \(problem ?? "ok", privacy: .public)")
    }

    /// A window of this app is in front and taking touches.
    private static var inFront: Bool {
        UIApplication.shared.connectedScenes.contains { $0.activationState == .foregroundActive }
    }

    /// Each connected scene's activation state, or "none".
    private static var scenes: String {
        let states = UIApplication.shared.connectedScenes.map { scene -> String in
            switch scene.activationState {
            case .unattached: "unattached"
            case .foregroundActive: "foregroundActive"
            case .foregroundInactive: "foregroundInactive"
            case .background: "background"
            @unknown default: "unknown (\(scene.activationState.rawValue))"
            }
        }
        return states.isEmpty ? "none" : states.joined(separator: ", ")
    }

    private static func name(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: "not determined"
        case .denied: "denied"
        case .authorized: "authorized"
        case .provisional: "provisional"
        case .ephemeral: "ephemeral"
        @unknown default: "unknown (\(status.rawValue))"
        }
    }

    private static func list(_ label: String) async {
        let delivered = await NotificationCentre.delivered()
        let categories = await NotificationCentre.categories()
        for note in delivered {
            let actions = (categories[note.category] ?? []).joined(separator: "|")
            log.notice("probe \(label, privacy: .public) \(note.identifier, privacy: .public) category=\(note.category, privacy: .public) actions=[\(actions, privacy: .public)] kind=\(note.fields["kind"] ?? "", privacy: .public) request=\(note.fields["requestId"] ?? "", privacy: .public) title=\(note.title, privacy: .public) body=\(note.body, privacy: .public)")
        }
        log.notice("probe \(label, privacy: .public) done: \(delivered.count) delivered, \(categories.count) categories")
    }

    private static func act(_ id: String, action: String, text: String?) async {
        guard let found = await NotificationCentre.delivered().first(where: { $0.identifier == id }) else {
            log.notice("probe act \(id, privacy: .public): not delivered")
            return
        }
        let note = PushNote(id: found.identifier, delivered: found.date, title: found.title, thread: found.thread,
                            category: found.category, action: action, text: text, fields: found.fields)
        let handled = await PushActions.perform(note)
        log.notice("probe acted \(id, privacy: .public) \(action, privacy: .public): handled \(handled)")
        // A notice posted in the push's place lands through `willPresent` first.
        try? await Task.sleep(for: .seconds(2))
        await list("after")
    }
}
#endif
