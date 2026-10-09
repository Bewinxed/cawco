import CawCoPush
import CryptoKit
import os
import UserNotifications

/// Opens a CawCo push on the device. The hub seals the real title, subtitle
/// and body with this device's push key (`"e"`, CawCoPush `SealedAlert`);
/// Cawrier and APNs carry only that and a safe alert. Opened, the
/// notification shows what the agent is asking; not opened (no key on this
/// device, a push sealed with another key), it shows as it arrived.
final class NotificationService: UNNotificationServiceExtension {
    private struct Pending {
        let handler: (UNNotificationContent) -> Void
        let arrived: UNNotificationContent
    }

    /// The content handler until it is called: by `didReceive`, or by
    /// `serviceExtensionTimeWillExpire` if that comes first. Once, either way.
    private let pending = OSAllocatedUnfairLock<Pending?>(uncheckedState: nil)
    private let log = Logger(subsystem: "dev.cawco.app", category: "Push")

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        pending.withLockUnchecked { $0 = Pending(handler: contentHandler, arrived: request.content) }
        hand(opened(request))
    }

    override func serviceExtensionTimeWillExpire() {
        hand(nil)
    }

    /// Calls the handler if it hasn't been: with `content`, else the push as it arrived.
    private func hand(_ content: UNNotificationContent?) {
        pending.withLockUnchecked { state in
            guard let waiting = state else { return }
            state = nil
            waiting.handler(content ?? waiting.arrived)
        }
    }

    /// The push with its sealed alert in place; nil leaves it as it arrived.
    /// Logs lengths and reasons, never the key or the words.
    private func opened(_ request: UNNotificationRequest) -> UNNotificationContent? {
        guard let sealed = request.content.userInfo["e"] as? String else { return nil }
        let alert: SealedAlert
        do {
            guard let pairing = try Pairing.stored(), let key = try PushKey.read(pairingId: pairing.id) else {
                log.notice("push \(request.identifier, privacy: .public) not opened: this device holds no push key")
                return nil
            }
            alert = try SealedAlert.open(sealed, key: key)
        } catch let error as KeychainFailure {
            log.error("push \(request.identifier, privacy: .public) not opened: keychain \(String(describing: error), privacy: .public)")
            return nil
        } catch let error as SealedAlert.Failure {
            log.error("push \(request.identifier, privacy: .public) not opened: \(String(describing: error), privacy: .public)")
            return nil
        } catch let error as CryptoKitError {
            log.error("push \(request.identifier, privacy: .public) not opened: \(String(describing: error), privacy: .public)")
            return nil
        } catch {
            log.error("push \(request.identifier, privacy: .public) not opened: \(String(describing: type(of: error)), privacy: .public)")
            return nil
        }
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return nil }
        content.title = alert.title
        content.subtitle = alert.subtitle ?? ""
        content.body = alert.body
        log.notice("push \(request.identifier, privacy: .public) opened: title \(alert.title.count) characters, subtitle \(alert.subtitle?.count ?? 0), body \(alert.body.count)")
        return content
    }
}
