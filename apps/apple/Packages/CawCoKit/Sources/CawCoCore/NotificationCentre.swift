import CawCoPush
public import Foundation
public import UserNotifications

/// The app's one way to the notification centre: nothing else calls
/// `UNUserNotificationCenter`, apart from the app delegate becoming its delegate.
///
/// Every call the centre takes is a message to the notifications daemon, and
/// it holds the calling thread until the daemon answers: the removals send
/// theirs synchronously, and the calls that take a completion set up their
/// channel with a synchronous wait before they return
/// (https://github.com/manaflow-ai/cmux/issues/4133). On a slow daemon the
/// main thread parked in `removePendingNotificationRequests` and the app never
/// drew its window. So no call is made from the main actor, or from Swift's
/// concurrent pool, which must not block: each one runs on this module's own
/// serial queue. A stalled daemon then holds one thread, never the interface.
///
/// The queue makes the calls in the order they were asked, and the centre
/// "processes requests serially in the order that the system initiates them"
/// (Apple's UNUserNotificationCenter documentation), so a removal asked before
/// an add lands before it. Every function here queues its call before it
/// returns or suspends; a caller waits only for an answer it needs.
public enum NotificationCentre {
    private static let queue = DispatchQueue(label: "dev.cawco.notification-centre", qos: .utility)

    /// A local notification, as plain values; the centre's objects are made on the queue.
    public struct LocalNote: Sendable {
        public var identifier: String
        public var title: String?
        public var body: String
        public var category = ""
        public var thread = ""
        /// The `cawco` object the app routes a tap by (`PushNote`).
        public var fields: [String: String]
        public var sound = false
        /// When it shows, in the device's calendar; nil is now.
        public var at: DateComponents?

        public init(identifier: String, title: String?, body: String, fields: [String: String]) {
            self.identifier = identifier
            self.title = title
            self.body = body
            self.fields = fields
        }

        fileprivate var request: UNNotificationRequest {
            let content = UNMutableNotificationContent()
            if let title { content.title = title }
            content.body = body
            content.categoryIdentifier = category
            content.threadIdentifier = thread
            content.userInfo = ["cawco": fields]
            if sound { content.sound = .default }
            let trigger = at.map { UNCalendarNotificationTrigger(dateMatching: $0, repeats: false) }
            return UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        }
    }

    /// A delivered notification, as plain values: what `PushNote` reads off one.
    public struct Delivered: Sendable {
        public let identifier: String
        public let date: Date
        public let title: String
        public let body: String
        public let thread: String
        public let category: String
        public let fields: [String: String]

        init(_ notification: UNNotification) {
            let content = notification.request.content
            identifier = notification.request.identifier
            date = notification.date
            title = content.title
            body = content.body
            thread = content.threadIdentifier
            category = content.categoryIdentifier
            fields = PushNote.fields(content.userInfo)
        }
    }

    // MARK: Changes: queued, not waited for

    /// The categories the hub's pushes name, and the question categories a
    /// delivered push still names (CawCoPush `PushCategory.install`, which
    /// waits on the centre's answers here, on the queue).
    public static func installCategories() {
        queue.async { PushCategory.install(adding: nil, pruning: true) }
    }

    public static func removePending(_ identifiers: [String]) {
        queue.async { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers) }
    }

    public static func removeDelivered(_ identifiers: [String]) {
        queue.async { UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: identifiers) }
    }

    public static func setBadge(_ count: Int) {
        queue.async { UNUserNotificationCenter.current().setBadgeCount(count, withCompletionHandler: nil) }
    }

    /// Adds `note`; `failed` hears the centre's refusal, off the main actor.
    public static func add(_ note: LocalNote, failed: @escaping @Sendable (any Error) -> Void) {
        queueAdd(note) { error in
            if let error { failed(error) }
        }
    }

    // MARK: Questions: queued now, the answer waited for

    /// Adds `note`, and waits for the centre's word that it took it.
    public static func add(_ note: LocalNote) async throws {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
            queueAdd(note) { error in
                if let error { done.resume(throwing: error) } else { done.resume() }
            }
        }
    }

    /// The one place a notification is added.
    private static func queueAdd(_ note: LocalNote, answered: @escaping @Sendable ((any Error)?) -> Void) {
        queue.async {
            UNUserNotificationCenter.current().add(note.request, withCompletionHandler: answered)
        }
    }

    /// iOS's word on this app's notifications.
    public static func authorization() async -> UNAuthorizationStatus {
        await withCheckedContinuation { done in
            queue.async {
                UNUserNotificationCenter.current().getNotificationSettings { settings in
                    done.resume(returning: settings.authorizationStatus)
                }
            }
        }
    }

    /// iOS asks the operator, the first time; true when allowed.
    public static func requestAuthorization(_ options: UNAuthorizationOptions) async throws -> Bool {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Bool, any Error>) in
            queue.async {
                UNUserNotificationCenter.current().requestAuthorization(options: options) { granted, error in
                    if let error { done.resume(throwing: error) } else { done.resume(returning: granted) }
                }
            }
        }
    }

    /// The notifications on show in Notification Centre.
    public static func delivered() async -> [Delivered] {
        await withCheckedContinuation { done in
            queue.async {
                UNUserNotificationCenter.current().getDeliveredNotifications { notes in
                    done.resume(returning: notes.map(Delivered.init))
                }
            }
        }
    }

    #if DEBUG
    /// Each registered category's identifier and its actions' titles, for `PushProbe`.
    public static func categories() async -> [String: [String]] {
        await withCheckedContinuation { done in
            queue.async {
                UNUserNotificationCenter.current().getNotificationCategories { categories in
                    done.resume(returning: Dictionary(uniqueKeysWithValues: categories.map { ($0.identifier, $0.actions.map(\.title)) }))
                }
            }
        }
    }
    #endif
}
