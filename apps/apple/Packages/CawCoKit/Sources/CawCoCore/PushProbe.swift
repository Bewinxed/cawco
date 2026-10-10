#if DEBUG
import Foundation
import OSLog

/// The push actions' simulator probe (scripts/probe-ios-push-actions.ts),
/// in DEBUG builds only, by launch argument:
///
/// - `-push-probe-register`: asks for notifications, then registers this
///   device's pairing and push key with the kept hub (`probeRegister`), so the
///   hub seals its pushes for this simulator.
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

    private static func register() async {
        let granted = (try? await NotificationCentre.requestAuthorization([.alert, .sound, .badge])) ?? false
        log.notice("probe authorization: \(granted ? "allowed" : "not allowed", privacy: .public)")
        let problem = await PushRegistry.shared.probeRegister()
        log.notice("probe registered: \(problem ?? "ok", privacy: .public)")
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
