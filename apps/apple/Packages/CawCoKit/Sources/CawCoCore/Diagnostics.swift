public import Foundation
public import MetricKit
import OSLog
import Synchronization
import UIKit

/// The app's hangs, crashes and CPU exceptions, as MetricKit reports them,
/// sent to the hub (`POST /api/diagnostics/apple`), so a hang on a phone
/// reports its own call stack. MetricKit delivers a diagnostic payload once,
/// on a later launch; each is written to disk first and sent from there, and
/// a file goes only once the hub took it, so a hub that was not there gets
/// it on the next launch. A payload carries what MetricKit includes and
/// nothing of the reader's: the device model, the OS, the app's version and
/// the stacks of the app's own threads.
public final class DiagnosticsReporter: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    public static let shared = DiagnosticsReporter()
    private let log = Logger(subsystem: "dev.cawco.app", category: "Diagnostics")
    private let folder: URL
    /// A send is under way: one sender at a time.
    private let inFlight = Mutex(false)

    override private init() {
        folder = URL.applicationSupportDirectory.appending(path: "diagnostics", directoryHint: .isDirectory)
        super.init()
    }

    /// At launch: MetricKit hands over what it holds, and anything left from
    /// a launch whose hub was not there goes now.
    @MainActor
    public func start() {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        MXMetricManager.shared.add(self)
        send()
    }

    public func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let data = payload.jsonRepresentation()
            let file = folder.appending(path: "\(UUID().uuidString).json")
            do {
                try data.write(to: file, options: .atomic)
            } catch {
                log.error("diagnostic payload not kept: \(String(describing: error), privacy: .public)")
            }
        }
        log.notice("MetricKit delivered \(payloads.count) diagnostic payload(s)")
        send()
    }

    public func didReceive(_: [MXMetricPayload]) {}

    /// Every payload on disk, to the hub; each one the hub took is removed.
    public func send() {
        let started = inFlight.withLock { busy in
            guard !busy else { return false }
            busy = true
            return true
        }
        guard started else { return }
        Task.detached(priority: .utility) { [self] in
            defer { inFlight.withLock { $0 = false } }
            // The hub this app keeps (`HubConnection.keptAddress`, read off the main actor).
            guard let hub = UserDefaults.standard.string(forKey: "cawco-hub-url").flatMap(URL.init(string:)),
                  let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            else { return }
            for file in files where file.pathExtension == "json" {
                guard let payload = try? Data(contentsOf: file),
                      let object = try? JSONSerialization.jsonObject(with: payload) else {
                    try? FileManager.default.removeItem(at: file)
                    continue
                }
                let body: [String: Any] = [
                    "appVersion": Self.info("CFBundleShortVersionString"),
                    "build": Self.info("CFBundleVersion"),
                    "os": "\(Self.system) \(ProcessInfo.processInfo.operatingSystemVersionString)",
                    "device": Self.model,
                    "payload": object,
                ]
                var request = URLRequest(url: hub.appending(path: "api/diagnostics/apple"))
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try? JSONSerialization.data(withJSONObject: body)
                do {
                    let (answer, response) = try await URLSession.shared.data(for: request)
                    guard let status = (response as? HTTPURLResponse)?.statusCode, (200 ..< 300).contains(status) else {
                        log.error("hub refused a diagnostic payload: \(String(decoding: answer, as: UTF8.self).prefix(200), privacy: .public)")
                        return
                    }
                    try? FileManager.default.removeItem(at: file)
                    log.notice("diagnostic payload sent: \(String(decoding: answer, as: UTF8.self), privacy: .public)")
                } catch {
                    // The hub is not there: the payload waits for the next launch.
                    log.info("diagnostic payload kept for later: \(String(describing: error), privacy: .public)")
                    return
                }
            }
        }
    }

    private static func info(_ key: String) -> String {
        Bundle.main.object(forInfoDictionaryKey: key) as? String ?? "?"
    }

    private static let system: String = {
        #if targetEnvironment(macCatalyst)
        "macOS"
        #else
        "iOS"
        #endif
    }()

    /// The hardware model (`iPhone18,2`), as MetricKit names it too.
    private static let model: String = {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
    }()
}
