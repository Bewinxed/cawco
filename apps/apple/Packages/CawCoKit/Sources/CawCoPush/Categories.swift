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
    public static let task = "CAWCO_TASK"
    public static let taskOpenOnly = "CAWCO_TASK_OPEN"
    public static let attempt = "CAWCO_ATTEMPT"
    public static let test = "CAWCO_TEST"
    /// A question's own category: `CAWCO_QUESTION.` and a hash of its options.
    private static let answeringPrefix = question + "."

    /// "Approve" is the only label for the grant (WORDS.md); there is no Deny.
    /// Approve, an answer and a reply act without opening the app, and only on
    /// an unlocked device (`.authenticationRequired`).
    public static func fixed() -> Set<UNNotificationCategory> {
        let open = UNNotificationAction(identifier: PushAction.open, title: "Open", options: [.foreground])
        let approve = UNNotificationAction(identifier: PushAction.approve, title: "Approve", options: [.authenticationRequired])
        let reply: UNNotificationAction = UNTextInputNotificationAction(
            identifier: PushAction.reply, title: "Reply", options: [.authenticationRequired],
            textInputButtonTitle: "Send", textInputPlaceholder: "Message")
        func category(_ id: String, _ actions: [UNNotificationAction]) -> UNNotificationCategory {
            UNNotificationCategory(identifier: id, actions: actions, intentIdentifiers: [])
        }
        return [
            category(permission, [open, approve]),
            category(permissionOpenOnly, [open]),
            category(question, [open]),
            category(task, [open, reply]),
            category(taskOpenOnly, [open]),
            category(attempt, [open, reply]),
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
        return UNNotificationCategory(identifier: id, actions: picks + [other], intentIdentifiers: [])
    }

    /// Registers the fixed categories, the question categories already
    /// registered (only those a delivered push still names, when `pruning`),
    /// and `adding`. Reads the centre's answers in place, so it blocks the
    /// calling thread: call it from the extension's own thread or the app's
    /// notification queue, never the main thread or Swift's concurrent pool.
    /// Returns once the centre has the new set: it answers in the order it was
    /// asked, so the read after the write waits for the write.
    public static func install(adding: UNNotificationCategory?, pruning: Bool) {
        let center = UNUserNotificationCenter.current()
        let current: Set<UNNotificationCategory> = answer { done in center.getNotificationCategories { done($0) } } ?? []
        var named: Set<String>?
        if pruning {
            named = answer { done in
                center.getDeliveredNotifications { notes in done(Set(notes.map(\.request.content.categoryIdentifier))) }
            }
            // An unanswered read keeps them all: a push on show must not lose its buttons.
            if named == nil { log.error("categories: delivered pushes unread; question categories kept") }
        }
        var all = fixed()
        for category in current where category.identifier.hasPrefix(answeringPrefix) && (named?.contains(category.identifier) ?? true) {
            all.insert(category)
        }
        if let adding { all.insert(adding) }
        center.setNotificationCategories(all)
        if answer({ done in center.getNotificationCategories { done($0.count) } }) == nil {
            log.error("categories: the centre did not answer after registering \(all.count) categories")
        }
    }

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    /// The centre's answer to `ask`, waited for on this thread; nil past 5 s.
    private static func answer<T>(_ ask: (@escaping @Sendable (T) -> Void) -> Void) -> T? {
        let box = OSAllocatedUnfairLock<T?>(uncheckedState: nil)
        let done = DispatchSemaphore(value: 0)
        ask { value in
            box.withLockUnchecked { $0 = value }
            done.signal()
        }
        guard done.wait(timeout: .now() + 5) == .success else { return nil }
        return box.withLockUnchecked { $0 }
    }
}
