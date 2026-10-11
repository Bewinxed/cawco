import CawCoPush
import os
import UserNotifications

/// Opens a CawCo push on the device (CawCoPush `PushOpening`). Opened, the
/// notification shows what the agent is asking; not opened (no key on this
/// device, a push sealed with another key), it shows as it arrived. A
/// question the hub let be answered inline leaves here with a category of
/// its own that offers its options, registered before it is handed back.
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

    /// The push opened, handed back at once; a question answered inline is
    /// handed back once its category is registered, so it shows with its options.
    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        pending.withLockUnchecked { $0 = Pending(handler: contentHandler, arrived: request.content) }
        guard let push = PushOpening.open(request) else {
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
}
