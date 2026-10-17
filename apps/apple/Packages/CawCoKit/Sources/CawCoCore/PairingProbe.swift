#if DEBUG
import Foundation
import Observation
import OSLog

/// The pairing probe's hook (scripts/probe-kit/specs/ios-pairing.ts), in
/// DEBUG builds only, by launch argument:
///
/// - `-pairing-probe-answer <approve|deny> <code>`: once the fleet model
///   holds the pairing showing `<code>` (the hub's read on connect, or its
///   `hub_auth` frame), answers it through `HubConnection.answerPairing`,
///   the call the app's own Approve and Deny make. `answerPairing` logs the
///   hub's word under category `Pairing`.
@MainActor
public enum PairingProbe {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Pairing")

    public static func run(_ hub: HubConnection) {
        let args = ProcessInfo.processInfo.arguments
        guard let at = args.firstIndex(of: "-pairing-probe-answer"), args.count > at + 2 else { return }
        let approve = args[at + 1] == "approve"
        let code = args[at + 2]
        Task {
            let deadline = ContinuousClock.now + .seconds(60)
            while !hub.fleet.pairingRequests.contains(where: { $0.userCode == code }) {
                guard ContinuousClock.now < deadline else {
                    log.notice("probe answer \(code, privacy: .public): never waiting here")
                    return
                }
                try? await Task.sleep(for: .milliseconds(250))
            }
            log.notice("probe answer \(code, privacy: .public): \(approve ? "approving" : "denying", privacy: .public)")
            await hub.answerPairing(code, approve: approve)
        }
    }
}
#endif
