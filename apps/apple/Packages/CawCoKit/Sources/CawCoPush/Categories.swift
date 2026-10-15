import CryptoKit
import Foundation
import os
public import UserNotifications

// The notification categories the hub's pushes name (push.ts
// `PUSH_CATEGORIES`) and the actions each offers, shared by the app and its
// Notification Service Extension.
//
// Categories are registered up front (`setNotificationCategories`, "This
// method registers all of your categories at once, replacing any previously
// registered categories"), so a question's own options can't be a fixed
// category. Its labels are what the agent wrote, sealed in the push's `"e"`
// beside the alert; the extension opens them, registers a category for that
// question merged into the ones already registered, and names it on the push
// before handing it back. The app prunes the question categories no
// delivered push still names.

/// The actions a push offers. An action's identifier is all the app gets back
/// with the response, so each names what to do.
public enum PushAction {
    public static let open = "OPEN"
    public static let approve = "APPROVE"
    public static let deny = "DENY"
    /// Text the operator typed, sent as a permission's denial: what to do instead.
    public static let denyWith = "DENY_WITH"
    /// Text the operator typed, sent to the push's session as their next message.
    public static let reply = "REPLY"
    /// Text the operator typed, sent as a question's answer (the card's "Other").
    public static let answerOther = "ANSWER_OTHER"
    private static let answerPrefix = "ANSWER_"

    /// The action of one option of a question; `id` is the option's (`SealedAlert.Option`).
    public static func answer(_ id: String) -> String { answerPrefix + id }

    /// The option an answer action picks; nil for "Other…" and every other action.
    public static func option(_ action: String) -> String? {
        guard action != answerOther, action.hasPrefix(answerPrefix) else { return nil }
        return String(action.dropFirst(answerPrefix.count))
    }
}

public enum PushCategory {
    public static let permission = "CAWCO_PERMISSION"
    public static let permissionOpenOnly = "CAWCO_PERMISSION_OPEN"
    public static let question = "CAWCO_QUESTION"
    public static let turn = "CAWCO_TURN"
    public static let task = "CAWCO_TASK"
    public static let taskOpenOnly = "CAWCO_TASK_OPEN"
    public static let attempt = "CAWCO_ATTEMPT"
    /// Several things that need you, as one push: it only opens Needs you.
    public static let needs = "CAWCO_NEEDS"
    public static let test = "CAWCO_TEST"
    /// A question's own category: `CAWCO_QUESTION.` and a hash of its options.
    private static let answeringPrefix = question + "."

    /// "Approve" is the only label for the grant (WORDS.md). A permission
    /// offers Approve, Deny, "Other…" (a denial in the operator's words) and
    /// Open, in that order: a banner shows the first two. Every action but
    /// Open runs without opening the app, and only on an unlocked device
    /// (`.authenticationRequired`). A permission the hub sends Open only
    /// (push.ts `OPEN_ONLY_TOOLS`) is read in full before it is answered.
    public static func fixed() -> Set<UNNotificationCategory> {
        let open = UNNotificationAction(identifier: PushAction.open, title: "Open", options: [.foreground])
        let approve = UNNotificationAction(identifier: PushAction.approve, title: "Approve", options: [.authenticationRequired])
        let deny = UNNotificationAction(identifier: PushAction.deny, title: "Deny", options: [.destructive, .authenticationRequired])
        let denyWith: UNNotificationAction = UNTextInputNotificationAction(
            identifier: PushAction.denyWith, title: "Other…", options: [.authenticationRequired],
            textInputButtonTitle: "Send", textInputPlaceholder: "What to do instead")
        let reply: UNNotificationAction = UNTextInputNotificationAction(
            identifier: PushAction.reply, title: "Reply", options: [.authenticationRequired],
            textInputButtonTitle: "Send", textInputPlaceholder: "Message")
        func category(_ id: String, _ actions: [UNNotificationAction]) -> UNNotificationCategory {
            UNNotificationCategory(identifier: id, actions: actions, intentIdentifiers: [], options: dismissable)
        }
        return [
            category(permission, [approve, deny, denyWith, open]),
            category(permissionOpenOnly, [open]),
            category(question, [open]),
            category(turn, [open, reply]),
            category(task, [open, reply]),
            category(taskOpenOnly, [open]),
            category(attempt, [open, reply]),
            category(needs, [open]),
            category(test, []),
        ]
    }

    /// A question's category: an action per option, in the question's order,
    /// then "Other…", which takes the operator's own words. Three options and
    /// Other are the four a category shows (push.ts `MAX_INLINE_OPTIONS`).
    /// The same options always make the same identifier.
    public static func answering(_ options: [SealedAlert.Option]) -> UNNotificationCategory {
        let digest = SHA256.hash(data: Data(options.map { "\($0.id)\u{0}\($0.label)" }.joined(separator: "\u{1}").utf8))
        let id = answeringPrefix + digest.prefix(8).map { String(format: "%02x", $0) }.joined()
        let picks = options.map {
            UNNotificationAction(identifier: PushAction.answer($0.id), title: $0.label, options: [.authenticationRequired])
        }
        let other: UNNotificationAction = UNTextInputNotificationAction(
            identifier: PushAction.answerOther, title: "Other…", options: [.authenticationRequired],
            textInputButtonTitle: "Send", textInputPlaceholder: "Your answer")
        return UNNotificationCategory(identifier: id, actions: picks + [other], intentIdentifiers: [], options: dismissable)
    }

    /// Every CawCo category: a single swipe-away reaches the app as
    /// `UNNotificationDismissActionIdentifier`, which it tells the hub
    /// (NotificationClearing `.dismiss`). Apple reports no "Clear All".
    private static let dismissable: UNNotificationCategoryOptions = [.customDismissAction]

    /// Registers the fixed categories, the question categories already
    /// registered (only those a delivered push still names, when `pruning`),
    /// and `adding`; then `installed`, on `queue`.
    ///
    /// Each request is sent from `queue` once the one before it is answered:
    /// the registered categories, the delivered pushes (when `pruning`), the
    /// new set, then a read of it. The centre answers in the order it was
    /// asked, so that read's answer means the new set is in. No thread waits
    /// for an answer: `queue` stays free for the calls queued behind, and an
    /// answer 5 s late is reported and its step taken without it.
    public static func install(adding: UNNotificationCategory?, pruning: Bool, on queue: DispatchQueue,
                               then installed: @escaping @Sendable () -> Void) {
        Install(adding: adding, pruning: pruning, queue: queue, installed: installed).start()
    }

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    /// One `install`, step by step. Every step runs on `queue`, one after the
    /// other, so `registered` is only ever touched there.
    private final class Install: @unchecked Sendable {
        let adding: UNNotificationCategory?
        let pruning: Bool
        let queue: DispatchQueue
        let installed: @Sendable () -> Void
        var registered: Set<UNNotificationCategory> = []

        init(adding: UNNotificationCategory?, pruning: Bool, queue: DispatchQueue, installed: @escaping @Sendable () -> Void) {
            self.adding = adding
            self.pruning = pruning
            self.queue = queue
            self.installed = installed
        }

        func start() {
            PushCategory.ask(on: queue, { reply in
                UNUserNotificationCenter.current().getNotificationCategories { reply($0) }
            }, answered: { [self] (current: Set<UNNotificationCategory>?) in
                registered = current ?? []
                if pruning { readDelivered() } else { register(named: nil) }
            })
        }

        private func readDelivered() {
            PushCategory.ask(on: queue, { reply in
                UNUserNotificationCenter.current().getDeliveredNotifications { notes in
                    reply(Set(notes.map(\.request.content.categoryIdentifier)))
                }
            }, answered: { [self] (named: Set<String>?) in
                // An unanswered read keeps them all: a push on show must not lose its buttons.
                if named == nil { PushCategory.log.error("categories: delivered pushes unread; question categories kept") }
                register(named: named)
            })
        }

        private func register(named: Set<String>?) {
            var all = PushCategory.fixed()
            for category in registered where category.identifier.hasPrefix(PushCategory.answeringPrefix) && (named?.contains(category.identifier) ?? true) {
                all.insert(category)
            }
            if let adding { all.insert(adding) }
            UNUserNotificationCenter.current().setNotificationCategories(all)
            let count = all.count
            PushCategory.ask(on: queue, { reply in
                UNUserNotificationCenter.current().getNotificationCategories { reply($0.count) }
            }, answered: { [self] (answer: Int?) in
                if answer == nil { PushCategory.log.error("categories: the centre did not answer after registering \(count) categories") }
                installed()
            })
        }
    }

    /// What one request has come to: nothing yet, or settled with the
    /// centre's answer (nil when 5 s passed first).
    private struct Asked<T> {
        var settled = false
        var answer: T?
    }

    /// Sends `request` from `queue`; `answered` runs on `queue` with the
    /// centre's answer, or with nil if 5 s pass after the send without one.
    /// Once, whichever comes first. Nothing waits: the 5 s is a timer.
    private static func ask<T>(on queue: DispatchQueue, _ request: @escaping @Sendable (@escaping @Sendable (T) -> Void) -> Void,
                               answered: @escaping @Sendable (T?) -> Void) {
        let asked = OSAllocatedUnfairLock<Asked<T>>(uncheckedState: Asked())
        let settle: @Sendable (T?) -> Void = { answer in
            let first = asked.withLockUnchecked { state -> Bool in
                guard !state.settled else { return false }
                state.settled = true
                state.answer = answer
                return true
            }
            guard first else { return }
            queue.async { answered(asked.withLockUnchecked { $0.answer }) }
        }
        queue.async {
            request { settle($0) }
            queue.asyncAfter(deadline: .now() + 5) { settle(nil) }
        }
    }
}
