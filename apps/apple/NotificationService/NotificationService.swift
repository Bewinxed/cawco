import CawCoPush
import Foundation
import os
import UserNotifications

/// Opens a CawCo push on the device (CawCoPush `PushOpening`). Opened, the
/// notification shows what the agent is asking; not opened (no key on this
/// device, a push sealed with another key), it shows as it arrived. A
/// question the hub let be answered inline leaves here with a category of
/// its own that offers its options, registered before it is handed back.
///
/// Before any push is handed back, the notifications its `cawco.cleared`
/// names (cleared on another device) are removed and confirmed gone, and what
/// this device showed is reconciled with what it shows now, so a "Clear All"
/// here reaches the hub (CawCoPush `NotificationClearing.arriving`).
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
    /// Where the centre is called from: a question's category, the removals.
    private let queue = DispatchQueue(label: "dev.cawco.notification-service")

    /// The clearing first; then the push, opened, handed back, once a
    /// question answered inline has its category registered.
    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        pending.withLockUnchecked { $0 = Pending(handler: contentHandler, arrived: request.content) }
        let push = PushOpening.open(request)
        pending.withLockUnchecked { $0?.opened = push?.content }
        nonisolated(unsafe) let category = push?.category
        let id = request.identifier
        let cleared = NotificationClearing.cleared(request.content.userInfo)
        let lock = pending
        let queue = queue
        Task {
            await NotificationClearing.arriving(id, cleared: cleared, on: queue)
            guard let category else {
                NotificationService.hand(lock)
                return
            }
            PushCategory.install(adding: category, pruning: false, on: queue) {
                NotificationService.hand(lock)
            }
        }
    }

    override func serviceExtensionTimeWillExpire() {
        Self.hand(pending, opened: false)
    }

    /// Calls the handler if it hasn't been: with the push opened, when
    /// `opened` and it was, else the push as it arrived.
    private static func hand(_ pending: OSAllocatedUnfairLock<Pending?>, opened: Bool = true) {
        pending.withLockUnchecked { state in
            guard let waiting = state else { return }
            state = nil
            waiting.handler(opened ? waiting.opened ?? waiting.arrived : waiting.arrived)
        }
    }
}
