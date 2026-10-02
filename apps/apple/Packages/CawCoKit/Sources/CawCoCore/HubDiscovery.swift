public import Foundation
import Network
import Observation
import OSLog

/// The hubs on the local network, as they announce themselves: Bonjour
/// `_cawco._tcp` (packages/hub/src/mdns.ts publishes it; the agent's
/// discovery.ts browses it). Each service is resolved to an address and
/// kept only once it answers as a hub does: `/api/agents` is the fleet, so a
/// 200 carrying an array is the test (discovery.ts `probeHub`).
///
/// Multicast is link-local: a hub across a router or only on a tailnet is not
/// found here, and is entered by hand.
@MainActor
@Observable
public final class HubDiscovery {
    public struct Found: Identifiable, Hashable, Sendable {
        public var id: URL { address }
        /// The service's name, `cawco-<hostname>`.
        public let name: String
        public let address: URL
    }

    public private(set) var found: [Found] = []
    public private(set) var browsing = false

    @ObservationIgnored private var browser: NWBrowser?
    private let log = Logger(subsystem: "dev.cawco.app", category: "Discovery")
    private nonisolated static let queue = DispatchQueue(label: "dev.cawco.discovery")
    /// How long a found address has to answer as a hub (discovery.ts `PROBE_TIMEOUT_MS`).
    nonisolated static let probeTimeout: TimeInterval = 1.5

    public init() {}

    public func start() {
        guard browser == nil else {
            return
        }
        let browser = NWBrowser(for: .bonjour(type: "_cawco._tcp", domain: "local."), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let services = results.compactMap { result -> (String, NWEndpoint)? in
                guard case let .service(name, _, _, _) = result.endpoint else {
                    return nil
                }
                return (name, result.endpoint)
            }
            Task { @MainActor in
                await self?.resolve(services)
            }
        }
        browser.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                guard let self else {
                    return
                }
                switch state {
                case .ready:
                    self.browsing = true
                case let .failed(error):
                    self.log.error("Bonjour browse failed: \(String(describing: error), privacy: .public)")
                    self.browsing = false
                case .cancelled:
                    self.browsing = false
                default:
                    break
                }
            }
        }
        browser.start(queue: Self.queue)
        self.browser = browser
    }

    public func stop() {
        browser?.cancel()
        browser = nil
        browsing = false
    }

    private func resolve(_ services: [(String, NWEndpoint)]) async {
        var next: [Found] = []
        for (name, endpoint) in services {
            guard let address = await Self.address(of: endpoint), await Self.isHub(address) else {
                continue
            }
            next.append(Found(name: name, address: address))
        }
        found = next.sorted { $0.name < $1.name }
    }

    /// Opens a connection to the service just long enough to learn the
    /// address and port it resolves to; IPv4 first, as the agent prefers.
    private nonisolated static func address(of endpoint: NWEndpoint) async -> URL? {
        let parameters = NWParameters.tcp
        if let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
            ip.version = .v4
        }
        let connection = NWConnection(to: endpoint, using: parameters)
        let resolved: URL? = await withCheckedContinuation { continuation in
            let once = Once(continuation)
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    once.resume(url(connection.currentPath?.remoteEndpoint))
                case .failed, .cancelled:
                    once.resume(nil)
                default:
                    break
                }
            }
            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + 3) {
                once.resume(nil)
            }
        }
        connection.cancel()
        return resolved
    }

    private nonisolated static func url(_ endpoint: NWEndpoint?) -> URL? {
        guard case let .hostPort(host, port) = endpoint else {
            return nil
        }
        let text: String
        switch host {
        case let .ipv4(address):
            text = "\(address)"
        case let .ipv6(address):
            text = "[\("\(address)".split(separator: "%").first ?? "")]"
        case let .name(name, _):
            text = name
        @unknown default:
            return nil
        }
        return URL(string: "http://\(text):\(port.rawValue)")
    }

    private nonisolated static func isHub(_ address: URL) async -> Bool {
        var request = URLRequest(url: address.appending(path: "api/agents"))
        request.timeoutInterval = probeTimeout
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200
        else {
            return false
        }
        return (try? JSONSerialization.jsonObject(with: data)) is [Any]
    }

    /// A continuation resumed exactly once, from whichever callback comes first.
    private final class Once: @unchecked Sendable {
        private let lock = NSLock()
        private var continuation: CheckedContinuation<URL?, Never>?

        init(_ continuation: CheckedContinuation<URL?, Never>) {
            self.continuation = continuation
        }

        func resume(_ value: URL?) {
            lock.lock()
            let pending = continuation
            continuation = nil
            lock.unlock()
            pending?.resume(returning: value)
        }
    }
}
