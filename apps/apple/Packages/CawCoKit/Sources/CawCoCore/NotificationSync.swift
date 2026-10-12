import CawCoPush
import Foundation
import OSLog
import UserNotifications

/// A notification cleared on one device clears on every other, in layers
/// that each change nothing when another got there first. On this device:
///
/// - (a) the hub's `notificationsCleared` socket frame, while a window is
///   connected: those ids are removed at once (`HubConnection`);
/// - (b) a sweep at launch, on every return to the front and, on the Mac,
///   whenever a window becomes key: what the hub cleared since the last
///   sweep (`/api/notifications/cleared`), on show here, is removed, and what
///   this device showed is reconciled with what it shows now;
/// - (c) the Notification Service Extension, on every visible push
///   (CawCoPush `NotificationClearing.arriving`);
/// - (d) the hub's background push, `cawco.cleared`, in the app delegate.
///
/// The other way, what the person did here reaches the hub
/// (`/api/notifications/dismiss`): a tap (`open`), an action that went
/// through (`action`), a single swipe (`dismiss`, through each category's
/// `.customDismissAction`), and, by reconciling, anything else that left
/// Notification Centre without this device removing it ("Clear All").
@MainActor
public enum NotificationSync {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Clearing")
    private static let sweptKey = "cawco-notifications-swept"
    /// The hub's clock and this device's differ; each sweep reads this far back past the last.
    private static let overlapMs: Double = 5 * 60 * 1000
    private static var sweeping = false
    private static var sweepAgain = false

    /// At launch: the hub's address where the extension reads it.
    public static func launch() {
        NotificationClearing.keepHub(HubConnection.keptAddress)
    }

    /// (a) The hub's socket frame.
    static func socketCleared(_ ids: [String]) {
        Task { await NotificationCentre.remove(ids, because: "socket") }
    }

    /// (d) A background push: its `cawco.cleared` removed and confirmed gone,
    /// then the record reconciled. Returns once both are done, for the
    /// completion handler.
    public static func background(_ userInfo: [AnyHashable: Any]) async {
        let cleared = NotificationClearing.cleared(userInfo)
        log.notice("background push clears \(cleared.joined(separator: ","), privacy: .public)")
        await NotificationCentre.remove(cleared, because: "background push")
        await NotificationClearing.reconcile(hubCleared: Set(cleared), arriving: nil, on: NotificationCentre.queue)
    }

    /// (b) One sweep at a time; a sweep asked during one runs once after it.
    public static func sweep(_ why: String) async {
        #if DEBUG
        // PushProbe's stand-in for the extension (`-push-probe-arrive`) runs
        // at launch; held, this launch's sweep can't reconcile before it.
        if ProcessInfo.processInfo.arguments.contains("-push-probe-hold-sweep") {
            log.notice("sweep (\(why, privacy: .public)) held for the probe")
            return
        }
        #endif
        guard !sweeping else {
            sweepAgain = true
            return
        }
        sweeping = true
        defer { sweeping = false }
        repeat {
            sweepAgain = false
            await sweepOnce(why)
        } while sweepAgain
    }

    private static func sweepOnce(_ why: String) async {
        let startedMs = (Date.now.timeIntervalSince1970 * 1000).rounded()
        let since = max(0, UserDefaults.standard.double(forKey: sweptKey) - overlapMs)
        var cleared: [String: Double] = [:]
        if let hub = HubConnection.keptAddress, let read = await readCleared(hub, since: since) {
            cleared = read
            UserDefaults.standard.set(startedMs, forKey: sweptKey)
        }
        // Only a notification delivered by the time the hub cleared its id:
        // ids are collapse ids, and a newer push under one is not cleared.
        let stale = await NotificationCentre.delivered().filter { note in
            cleared[note.identifier].map { note.date.timeIntervalSince1970 * 1000 <= $0 } ?? false
        }.map(\.identifier)
        log.notice("sweep (\(why, privacy: .public)): hub cleared \(cleared.count) since \(Int(since)), \(stale.count) on show")
        await NotificationCentre.remove(stale, because: "sweep")
        await NotificationClearing.reconcile(hubCleared: Set(cleared.keys), arriving: nil, on: NotificationCentre.queue)
    }

    /// `GET /api/notifications/cleared?since=`: each cleared id and when, ms
    /// epoch on the hub's clock. Nil when the hub didn't answer it.
    @concurrent
    private nonisolated static func readCleared(_ hub: URL, since: Double) async -> [String: Double]? {
        struct Answer: Decodable {
            struct Cleared: Decodable {
                let collapseId: String
                let at: Double
            }

            let cleared: [Cleared]
        }
        var parts = URLComponents(url: hub.appending(path: "api/notifications/cleared"), resolvingAgainstBaseURL: false)
        parts?.queryItems = [URLQueryItem(name: "since", value: String(Int(since)))]
        guard let url = parts?.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else {
                Logger(subsystem: "dev.cawco.app", category: "Clearing").error("cleared read: hub answered \(status)")
                return nil
            }
            let answer = try JSONDecoder().decode(Answer.self, from: data)
            return answer.cleared.reduce(into: [:]) { $0[$1.collapseId] = max($0[$1.collapseId] ?? 0, $1.at) }
        } catch {
            Logger(subsystem: "dev.cawco.app", category: "Clearing").error("cleared read failed: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// The person answered a notification (the notification centre's
    /// delegate). A tap or Open runs `open`, then the hub hears `open`; an
    /// action runs (`PushActions`) and, once it went through, the hub hears
    /// `action`; a single swipe-away is `dismiss`. Returns when the hub has
    /// been told, so the caller's completion handler comes after it.
    public static func respond(_ note: PushNote, open: () -> Void) async {
        switch note.action {
        case UNNotificationDismissActionIdentifier:
            await NotificationClearing.report([note.id], via: .dismiss)
        case UNNotificationDefaultActionIdentifier, PushCategories.open:
            open()
            await NotificationClearing.report([note.id], via: .open)
        default:
            switch await PushActions.perform(note) {
            case .sent:
                await NotificationClearing.report([note.id], via: .action)
            case .notSent:
                log.notice("action \(note.action, privacy: .public) on \(note.id, privacy: .public) didn't go: not reported")
            case .notAnAction:
                log.notice("unknown action \(note.action, privacy: .public) on \(note.id, privacy: .public)")
            }
        }
    }
}
