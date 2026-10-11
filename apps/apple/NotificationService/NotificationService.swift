import CawCoPush
import os
import UserNotifications

/// Opens a CawCo push on the device. The hub seals the real title, subtitle
/// and body with this device's push key (`"e"`, CawCoPush `SealedAlert`);
/// Cawrier and APNs carry only that and a safe alert. Opened, the
/// notification shows what the agent is asking; not opened (no key on this
/// device, a push sealed with another key), it shows as it arrived. A
/// question the hub let be answered inline carries its options sealed too,
/// and leaves here with a category of its own that offers them.
final class NotificationService: UNNotificationServiceExtension {
    private struct Pending {
        let handler: (UNNotificationContent) -> Void
        let arrived: UNNotificationContent
        /// The push opened, once it is: what `didReceive` hands back.
        var opened: UNNotificationContent?
    }

    /// The content handler until it is called: by `didReceive`, or by
    /// `serviceExtensionTimeWillExpire` if that comes first. Once, either way.
    private let pending = OSAllocatedUnfairLock<Pending?>(uncheckedState: nil)
    /// Where a question's category is registered (CawCoPush `PushCategory.install`).
    private let queue = DispatchQueue(label: "dev.cawco.notification-service")
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    /// The push opened, handed back at once; a question answered inline is
    /// handed back once its category is registered, so it shows with its options.
    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        pending.withLockUnchecked { $0 = Pending(handler: contentHandler, arrived: request.content) }
        guard let push = opened(request) else {
            Self.hand(pending, opened: false)
            return
        }
        pending.withLockUnchecked { $0?.opened = push.content }
        guard let category = push.category else {
            Self.hand(pending, opened: true)
            return
        }
        let lock = pending
        PushCategory.install(adding: category, pruning: false, on: queue) {
            NotificationService.hand(lock, opened: true)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        Self.hand(pending, opened: false)
    }

    /// Calls the handler if it hasn't been: with the push opened, when
    /// `opened` and it was, else the push as it arrived.
    private static func hand(_ pending: OSAllocatedUnfairLock<Pending?>, opened: Bool) {
        pending.withLockUnchecked { state in
            guard let waiting = state else { return }
            state = nil
            waiting.handler(opened ? waiting.opened ?? waiting.arrived : waiting.arrived)
        }
    }

    /// The push with its sealed alert in place, and the category to register
    /// first when it is a question answered inline; nil leaves it as it
    /// arrived. Logs lengths and reasons, never the key or the words.
    private func opened(_ request: UNNotificationRequest) -> (content: UNNotificationContent, category: UNNotificationCategory?)? {
        let log = Self.log
        guard let sealed = request.content.userInfo["e"] as? String else { return nil }
        let alert: SealedAlert
        do {
            guard let pairing = try Pairing.stored(), let key = try PushKey.read(pairingId: pairing.id) else {
                log.notice("push \(request.identifier, privacy: .public) not opened: this device holds no push key")
                return nil
            }
            alert = try SealedAlert.open(sealed, key: key)
        } catch is DecodingError {
            log.error("push \(request.identifier, privacy: .public) not opened: its alert is not v1 JSON")
            return nil
        } catch {
            // Valet's KeychainError, CryptoKitError, SealedAlert.Failure: none carries the key or the words.
            log.error("push \(request.identifier, privacy: .public) not opened: \(String(describing: error), privacy: .public)")
            return nil
        }
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return nil }
        content.title = alert.title
        content.subtitle = alert.subtitle ?? ""
        content.body = alert.body
        log.notice("push \(request.identifier, privacy: .public) opened: title \(alert.title.count) characters, subtitle \(alert.subtitle?.count ?? 0), body \(alert.body.count)")
        let category = answerable(content, options: alert.options)
        return (content: content as UNNotificationContent, category: category)
    }

    /// A question the hub let be answered from the push (push.ts
    /// `inlineOptions`) gets its own category, an action per option and
    /// "Other…", registered before the push is handed back so it shows with
    /// them. Without options it stays as the hub named it, Open only: nil.
    private func answerable(_ content: UNMutableNotificationContent, options: [SealedAlert.Option]?) -> UNNotificationCategory? {
        guard content.categoryIdentifier == PushCategory.question, let options, !options.isEmpty else { return nil }
        let category = PushCategory.answering(options)
        content.categoryIdentifier = category.identifier
        Self.log.notice("question push answers inline: category \(category.identifier, privacy: .public), \(options.count) options")
        return category
    }
}
