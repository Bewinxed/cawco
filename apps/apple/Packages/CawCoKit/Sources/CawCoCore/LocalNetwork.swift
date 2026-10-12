import Foundation
import Network
#if DEBUG
import notify
#endif
import Synchronization
import UIKit

/// Whether Local Network privacy is what stopped a request to the hub.
///
/// A build the system has not let onto the local network fails its requests
/// to a LAN address with NSURLErrorNotConnectedToInternet (-1009) while the
/// internet is up: the URL loading system says "offline" for a path the
/// policy refuses. There is no API that returns the access state ("There is
/// no API that directly returns your local network access state", Local
/// Network Privacy FAQ-9, developer.apple.com/forums/thread/663852). The way
/// Apple gives is a connection to the address itself: "If the connection
/// stalls in the .waiting(_:) state, you can look at the current path to see
/// whether it's waiting for local network access" (FAQ-10,
/// developer.apple.com/forums/thread/663769), its `unsatisfiedReason` then
/// `.localNetworkDenied`.
public enum LocalNetwork {
    /// How long the connection is given to say ready or waiting. Our choice:
    /// a LAN peer answers in milliseconds, and a refused path waits at once.
    static let settle: Duration = .seconds(2)

    /// Whether a request to `url` failed because this app is not allowed on
    /// the local network: a TCP connection to its host and port, held until it
    /// is ready (allowed), waiting (its path says why), or `settle` passes.
    public static func denied(_ url: URL) async -> Bool {
        #if DEBUG
        if debugDenied { return true }
        #endif
        guard let host = url.host(), let port = NWEndpoint.Port(rawValue: UInt16(url.port ?? (url.scheme == "https" ? 443 : 80))) else {
            return false
        }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        let answer = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            let pending = Pending(continuation)
            let settle = { @Sendable (denied: Bool) in pending.resume(denied) }
            connection.stateUpdateHandler = { state in
                switch state {
                case .waiting: settle(connection.currentPath?.unsatisfiedReason == .localNetworkDenied)
                case .ready, .failed, .cancelled: settle(false)
                default: break
                }
            }
            connection.start(queue: .global(qos: .utility))
            Task {
                try? await Task.sleep(for: Self.settle)
                settle(false)
            }
        }
        connection.cancel()
        return answer
    }

    /// The probe's answer, given once: by the connection's state or by `settle` passing.
    private final class Pending: Sendable {
        private let waiting: Mutex<CheckedContinuation<Bool, Never>?>
        init(_ continuation: CheckedContinuation<Bool, Never>) { waiting = Mutex(continuation) }
        func resume(_ denied: Bool) {
            waiting.withLock { continuation in
                continuation?.resume(returning: denied)
                continuation = nil
            }
        }
    }

    /// Whether `error` is the kind Local Network privacy produces: the path
    /// refused as "offline", or the host not reached.
    static func mayBeDenied(_ error: URLError) -> Bool {
        error.code == .notConnectedToInternet || error.code == .cannotConnectToHost
    }

    /// Where the switch is reached from. On iPhone, this app's own page in
    /// Settings, which holds its Local Network switch. On the Mac no URL
    /// reaches the Local Network list: every anchor tried on macOS 27
    /// (`Privacy_LocalNetwork` and the pane's own names) lands on the top of
    /// Privacy & Security, as Sequel Ace found on macOS 15 (it "won't navigate
    /// to the Local Network pane—it will open Privacy & Security instead",
    /// github.com/Sequel-Ace/Sequel-Ace/pull/2347). So the Mac opens Privacy &
    /// Security, and the words name the last click (`refusal`).
    @MainActor public static var settingsURL: URL {
        #if targetEnvironment(macCatalyst)
        URL(string: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension")!
        #else
        URL(string: UIApplication.openSettingsURLString)!
        #endif
    }

    /// What the button that opens `settingsURL` says: where it goes.
    public static var settingsAction: String {
        #if targetEnvironment(macCatalyst)
        "Open Privacy & Security"
        #else
        "Open Settings"
        #endif
    }

    /// How to allow it, as a clause (the pane in place of a transcript).
    public static var allowIt: String {
        #if targetEnvironment(macCatalyst)
        "Turn it on in Privacy & Security › Local Network"
        #else
        "Allow it in Settings"
        #endif
    }

    /// The status line while the hub is refused. On the Mac the button lands
    /// one click short, so the line names that click.
    public static var refusal: String {
        #if targetEnvironment(macCatalyst)
        "CawCo isn't allowed on the local network: turn it on in Privacy & Security › Local Network"
        #else
        "CawCo isn't allowed on the local network"
        #endif
    }

    #if DEBUG
    /// The simulator cannot enforce Local Network privacy (HubDiscovery's
    /// `--discovery-policy-denied` says the same of the search): launched
    /// with `--hub-local-network-denied`, the hub socket and every read fail
    /// as a refused path fails them, and the path's word is refused, until a
    /// pass posts `dev.cawco.debug.local-network-allowed` (notifyutil), which
    /// is access allowed in Settings (`allowOnDebugSignal`).
    private static let debugState = Mutex(ProcessInfo.processInfo.arguments.contains("--hub-local-network-denied"))

    static var debugDenied: Bool { debugState.withLock { $0 } }

    /// Hears the pass's "allowed": registered once, at launch.
    public static func allowOnDebugSignal() {
        var token: Int32 = 0
        notify_register_dispatch("dev.cawco.debug.local-network-allowed", &token, .main) { _ in
            debugState.withLock { $0 = false }
        }
    }
    #endif
}
