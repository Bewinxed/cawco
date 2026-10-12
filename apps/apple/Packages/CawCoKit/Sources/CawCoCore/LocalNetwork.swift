import Foundation
import Network
import Synchronization

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
        // The simulator cannot enforce Local Network privacy (HubDiscovery's
        // `--discovery-policy-denied`): the path's word is injected.
        if ProcessInfo.processInfo.arguments.contains("--hub-local-network-denied") { return true }
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

    /// Where the reader turns it on, for this platform's Settings.
    public static var fix: String {
        #if targetEnvironment(macCatalyst)
        "Turn on CawCo in System Settings › Privacy & Security › Local Network"
        #else
        "Turn on CawCo in Settings › Privacy & Security › Local Network"
        #endif
    }
}
