import Foundation
import os
public import UserNotifications

/// The opening of a CawCo push, the Notification Service Extension's work
/// (NotificationService). The hub seals the real title, subtitle and body
/// with this device's push key (`"e"`, `SealedAlert`); Cawrier and APNs carry
/// only that and a safe alert. A question the hub let be answered inline
/// carries its options sealed too, and leaves with a category of its own
/// that offers them, to be registered before the push is handed back.
///
/// One function for the extension and for the app's simulator probe
/// (CawCoCore `PushProbe`, DEBUG): a simulator never hands a `simctl push` to
/// the extension (Xcode 11.4 release notes, 55822721: "Notification Service
/// Extensions do not work in simulated push notifications"), so the probe
/// runs this same opening on the delivered push from the app.
public enum PushOpening {
    public struct Opened {
        /// The push with its sealed alert in place.
        public let content: UNNotificationContent
        /// The question's own category, to register before the push shows; nil for every other push.
        public let category: UNNotificationCategory?
    }

    private static let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    /// The push opened, or nil to leave it as it arrived (no key on this
    /// device, a push sealed with another key, no sealed alert). Logs lengths
    /// and reasons, never the key or the words.
    public static func open(_ request: UNNotificationRequest) -> Opened? {
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
        return Opened(content: content, category: category)
    }

    /// A question the hub let be answered from the push (push.ts
    /// `inlineOptions`) gets its own category, an action per option and
    /// "Other…", named on the push. Without options it stays as the hub
    /// named it, Open only: nil.
    private static func answerable(_ content: UNMutableNotificationContent, options: [SealedAlert.Option]?) -> UNNotificationCategory? {
        guard content.categoryIdentifier == PushCategory.question, let options, !options.isEmpty else { return nil }
        let category = PushCategory.answering(options)
        content.categoryIdentifier = category.identifier
        log.notice("question push answers inline: category \(category.identifier, privacy: .public), \(options.count) options")
        return category
    }
}
