public import Foundation
import Network
import Observation
import OSLog
import dnssd

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
    public private(set) var localNetworkDenied = false
    /// Nil until the monitor has delivered this network's path.
    public private(set) var localNetworkAvailable: Bool?

    @ObservationIgnored private var monitor: NWPathMonitor?
    @ObservationIgnored private var browser: NWBrowser?
    @ObservationIgnored private var candidates: [NWEndpoint: Task<Void, Never>] = [:]
    @ObservationIgnored private var answered: [NWEndpoint: Found] = [:]
    #if DEBUG
    @ObservationIgnored private var injectedDenial = false
    #endif
    private let log = Logger(subsystem: "dev.cawco.app", category: "Discovery")
    private nonisolated static let queue = DispatchQueue(label: "dev.cawco.discovery")
    /// How long a found address has to answer as a hub (discovery.ts `PROBE_TIMEOUT_MS`).
    nonisolated static let probeTimeout: TimeInterval = 1.5
    /// The agent's MDNS_BROWSE_MS: keep looking on its two-second cadence.
    private static let retryInterval: Duration = .seconds(2)

    public init() {}

    public func start() {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        self.monitor = monitor
        monitor.pathUpdateHandler = { [weak self, weak monitor] path in
            let available = path.status == .satisfied && (path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet))
            Task { @MainActor in
                guard let self, let monitor, self.monitor === monitor else { return }
                self.updatePath(available)
            }
        }
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--discovery-no-wifi") {
            updatePath(false)
            return
        }
        if arguments.contains("--discovery-searching") || arguments.contains("--discovery-policy-denied") {
            updatePath(true)
            return
        }
        #endif
        monitor.start(queue: Self.queue)
    }

    private func updatePath(_ available: Bool) {
        localNetworkAvailable = available
        if available {
            startBrowser()
        } else {
            stopBrowser()
            localNetworkDenied = false
        }
    }

    private func startBrowser() {
        guard browser == nil else {
            return
        }
        let browser = NWBrowser(for: .bonjour(type: "_cawco._tcp", domain: "local."), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self, weak browser] results, _ in
            let services = results.compactMap { result -> (String, NWEndpoint)? in
                guard case let .service(name, _, _, _) = result.endpoint else {
                    return nil
                }
                return (name, result.endpoint)
            }
            Task { @MainActor in
                guard let self, let browser, self.browser === browser else { return }
                self.update(services)
            }
        }
        browser.stateUpdateHandler = { [weak self, weak browser] state in
            Task { @MainActor in
                guard let self, let browser, self.browser === browser else { return }
                self.update(state)
            }
        }
        self.browser = browser
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--discovery-searching") {
            update(.ready)
            return
        }
        // The simulator cannot enforce Local Network privacy. Inject the
        // system's state once; returning from Settings then runs a real browse.
        if !injectedDenial, ProcessInfo.processInfo.arguments.contains("--discovery-policy-denied") {
            injectedDenial = true
            update(.waiting(.dns(DNSServiceErrorType(kDNSServiceErr_PolicyDenied))))
            return
        }
        #endif
        log.info("Bonjour browse started")
        browser.start(queue: Self.queue)
    }

    public func stop() {
        monitor?.cancel()
        monitor = nil
        stopBrowser()
        localNetworkAvailable = nil
        localNetworkDenied = false
    }

    private func stopBrowser() {
        browser?.cancel()
        browser = nil
        browsing = false
        for task in candidates.values { task.cancel() }
        candidates = [:]
        answered = [:]
        found = []
    }

    private func update(_ state: NWBrowser.State) {
        switch state {
        case .ready:
            browsing = true
            localNetworkDenied = false
        case let .waiting(error):
            browsing = false
            if case let .dns(code) = error {
                localNetworkDenied = code == kDNSServiceErr_PolicyDenied
            } else {
                localNetworkDenied = false
            }
            if localNetworkDenied {
                log.notice("Bonjour search blocked by Local Network access")
            }
        case let .failed(error):
            log.error("Bonjour browse failed: \(String(describing: error), privacy: .public)")
            browsing = false
        case .cancelled:
            browsing = false
        default:
            break
        }
    }

    private func update(_ services: [(String, NWEndpoint)]) {
        let present = Set(services.map { $0.1 })
        for endpoint in candidates.keys where !present.contains(endpoint) {
            candidates.removeValue(forKey: endpoint)?.cancel()
            answered.removeValue(forKey: endpoint)
        }
        publish()
        for (name, endpoint) in services where candidates[endpoint] == nil {
            candidates[endpoint] = Task { [weak self] in
                // Resolve again too: an announcement can outlast its listener
                // or move to a new address while the hub is starting.
                while !Task.isCancelled {
                    if let address = await Self.address(of: endpoint), !Task.isCancelled {
                        let isHub = await Self.isHub(address)
                        guard !Task.isCancelled else { return }
                        if isHub {
                            self?.accept(Found(name: name, address: address), for: endpoint)
                            return
                        }
                    }
                    guard !Task.isCancelled else { return }
                    self?.log.info("Bonjour candidate \(name, privacy: .public) has not answered; retrying")
                    do { try await Task.sleep(for: Self.retryInterval) } catch { return }
                }
            }
        }
    }

    private func accept(_ hub: Found, for endpoint: NWEndpoint) {
        answered[endpoint] = hub
        log.notice("Bonjour hub \(hub.name, privacy: .public) answered at \(hub.address.absoluteString, privacy: .public)")
        publish()
    }

    private func publish() {
        found = Array(Set(answered.values)).sorted { $0.name < $1.name }
    }

    /// Opens a connection to the service just long enough to learn the
    /// address and port it resolves to; IPv4 first, as the agent prefers.
    private nonisolated static func address(of endpoint: NWEndpoint) async -> URL? {
        let parameters = NWParameters.tcp
        if let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
            ip.version = .v4
        }
        let connection = NWConnection(to: endpoint, using: parameters)
        let resolved: URL? = await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let once = Once(continuation)
                connection.stateUpdateHandler = { state in
                    switch state {
                    case .ready:
                        #if DEBUG
                        Logger(subsystem: "dev.cawco.app", category: "Discovery").info("Resolved Bonjour endpoint: \(String(describing: connection.currentPath?.remoteEndpoint), privacy: .public)")
                        #endif
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
        } onCancel: {
            connection.cancel()
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
            // Network can scope even IPv4 to the Bonjour interface (%en0).
            // That scope belongs to the connection, not an HTTP URL's host.
            text = "\(address)".components(separatedBy: "%")[0]
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
